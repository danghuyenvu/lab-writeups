---
title: Principal
date: 2026-04-21
category: [HackTheBox, Linux, Web Exploitation, Cryptography]
tags: [nmap, ffuf]
difficulty: Medium
summary: Principal is a medium rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/Principal)

## Reconnaissance
Start with an Nmap scan:
```bash
nmap -sVC -vv -p- IP -T4 -oN nmap-scan
```
![](../Images/Pasted%20image%2020260420230920.png)
Nmap reveals a HTTP proxy at port 8080.
![](../Images/Pasted%20image%2020260420222852.png)
A proxy server running an instance of pac4j-jwt/6.0.3, which is vulnerable to CVE-2026-29000.
## [CVE-2026-29000](https://snyk.io/articles/public-key-breaks-authentication-pac4j-jwt/)
- Package:
- Affected: 4.x \< 4.5.9, 5.0.0-RC1 \< 5.7.9, 6.0.4.1 \< 6.3.3
- Patched: 4.5.9, 5.7.9, 6.3.3
- Severity: 10/10 (Critical)
- Weaknesses: CWE-347: Improper Verification of Cryptographic Signature
Function `toSignedJWT()` is used to extract the Json Web Signature from the decrypted JWE. However, if the extracted token is in plain JWT with alg: none, the function returns NULL, which skips all the trailing signature verification. An attacker can abuse this to bypass the signature verification and access authenticated resource with forged JWE.
## Exploitation
`http://10.129.26.214:8080/api/auth/jwks` to retrieve the server's public key.
Download the PoC for CVE-2026-29000 and use the public jwks endpoint to generate a malicious Bearer token.
The endpoint `static/js/app.js` reveals the schema of the inner JWT:
![](../Images/Pasted%20image%2020260421110115.png)
We then use the PoC to forge a key with username `admin` and role `ROLE_ADMIN`:
![](../Images/Pasted%20image%2020260421085422.png)
Edit the Session storage of the website in brower's developer console:
![](../Images/Pasted%20image%2020260421091736.png)
We were able to get into the dashboard page.
![](../Images/Pasted%20image%2020260421091751.png)
Found an Encryption Key under Security tab in Settings:
![](../Images/Pasted%20image%2020260421092901.png)
Try this password to SSH as every user listed in, we were able to ssh as `svc-deploy`.
## Privilege Escalation
First tryna list some of the SUID binaries, maybe we are able to exploit that
![](../Images/Pasted%20image%2020260421093212.png)
![](../Images/Pasted%20image%2020260421093237.png)
`sudo -l` shows that current user cannot run `sudo`.
Check the uid and gid of curent user:
![](../Images/Pasted%20image%2020260421093158.png)
The user belongs to another group called `deployers`. Check if any file owned by this group is interesting:
```bash
find / -type f -group deployers -exec ls -l {} \; 2>/dev/null
```
![](../Images/Pasted%20image%2020260421103241.png)
![](../Images/Pasted%20image%2020260421104043.png)
The config file showing that the root login with password is prohibitted. But the server trusts that specific CA key. Which means we can authorized to this machine if we got our public key signed by this CA's private key. We can just generate a new pair on this machine and then download them later.
So first we create a new key pair with ssh-keygen for the current user.
Then we sign our public key with 
```bash
ssh-keygen -s <path-to-ca-private> -I "root" -n root -V +1d <path-to-pubkey>
```
This means we are signing this public key with the root principal `-n root`.
- `-I `: the cert's identity.
- `-V`: validity period of this cert.
![](../Images/Pasted%20image%2020260421102511.png)
Now we have the public key signed by the CA, we can download both the private key and the cert to our machine and ssh as root:
![](../Images/Pasted%20image%2020260421102907.png)
## Summary
## Remediation

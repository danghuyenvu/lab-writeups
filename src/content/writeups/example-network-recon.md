---
title: Network Enumeration and Service Fingerprinting Lab
date: 2026-01-20
category: Network Security
tags: [nmap, enumeration, recon]
difficulty: Easy
summary: Mapping an internal lab network and identifying vulnerable services before exploitation.
---

## Objective

Enumerate hosts and open services on a lab subnet to build an attack surface map.

## Host discovery

```
nmap -sn 10.10.10.0/24
```

Three live hosts responded. A follow-up `-sV -sC` scan against each host revealed an outdated SMB service and an exposed Jenkins instance with default credentials.

![Nmap scan output showing open SMB and Jenkins ports](/images/example-network-recon/nmap-output.svg)

## Notes

- Always start broad (host discovery) before narrowing to service-level scans — it saves time on large ranges.
- Default credentials are still, by far, the most common finding in lab environments like this one.

## Next steps

Documented findings and moved on to the Jenkins misconfiguration in a separate writeup.

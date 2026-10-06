---
track: linux
title: Disks, links and archives
short: Disks, archives
sub: How storage is organised, what to do when a disk fills up, and how to pack files.
---

:::goals
- read `df`, `du` and `lsblk`
- explain mounting, filesystems and `/etc/fstab`
- understand hard links and symbolic links
- create and unpack `tar` archives
- diagnose and fix a full disk
:::

## One tree, many disks

@setup evlab

Windows gives each disk a letter (`C:`, `D:`). Linux has **one tree** starting at `/`. A disk or partition is **mounted** onto a folder, called a mount point, and its contents appear there. Everything under `/var/log` might be on a different physical disk from `/`, and you cannot tell by the path alone.

| Command | Use |
|---|---|
| `lsblk` | list block devices (disks, partitions) |
| `df -h` | free space per mounted filesystem (`-h` = human sizes) |
| `du -sh folder` | how much space a folder uses |
| `mount` / `findmnt` | what is mounted where |
| `/etc/fstab` | the file listing what to mount at boot |

```run
df -h / | head -1
findmnt -n -o TARGET,FSTYPE /
```

## A full disk, safely

A full disk is one of the most common real incidents (EV storage, logs, SQL). Rather than just read about it, we build a tiny 8 MB disk **image**, format it with a filesystem (`ext4`), mount it and fill it.

```run
cd ~/lab
dd if=/dev/zero of=tiny.img bs=1M count=8 status=none
mkfs.ext4 -q tiny.img
mkdir -p mnt
sudo mount -o loop tiny.img mnt
sudo chown student mnt
findmnt -n -o TARGET,FSTYPE mnt
```

Now fill it and watch it break:

```run
cd ~/lab
dd if=/dev/zero of=mnt/big.dat bs=1M count=100 2>&1 | grep -i "no space"
df -h mnt | awk 'NR==2{print "use%:", $5}'
echo "try to write a new file:"
echo hello > mnt/new.txt
```

`No space left on device`. First instinct: find what is big.

```run
cd ~/lab
ls -lh mnt | awk 'NR>1{print $5, $9}'
ls -lh mnt/big.dat | awk '{print $5, $9}'
rm mnt/big.dat
df -h mnt | awk 'NR==2{print "use%:", $5}'
echo hello > mnt/new.txt && echo "writing works again"
```

A related trap: **inodes**. A filesystem has a limited number of file entries (inodes). Millions of tiny files can exhaust inodes while `df -h` still shows free space. Check with `df -i`.

```run
cd ~/lab
df -i mnt | awk 'NR==2{print "inode use%:", $5}'
sudo umount mnt
```

:::tip Find the space hog
`du -ah /var | sort -rh | head -20` lists the 20 biggest items under `/var`. Also check for **deleted files still held open** by a running program: `lsof +L1`. The space is freed only when the program closes the file or restarts.
:::

## Links: two ways to have another name

```run
cd ~/lab && rm -f orig.txt hard.txt soft.txt
echo "version 1" > orig.txt
ln orig.txt hard.txt        # hard link
ln -s orig.txt soft.txt     # symbolic link (shortcut)
ls -li orig.txt hard.txt soft.txt | awk '{print $1, $2, $10, $11, $12}'
cat soft.txt
```

- A **hard link** is a second name for the same data (same inode number, first column). Deleting one name leaves the other working.
- A **symbolic link** (symlink) is a small file that holds a path, like a Windows shortcut. If the target is deleted, the link dangles.

```run
cd ~/lab
rm orig.txt
cat hard.txt
cat soft.txt
```

The hard link still holds the data; the symlink is broken. Symlinks are used everywhere: `/etc/alternatives`, release folders (`current -> release-42`), systemd's enabled services.

## Archives and compression

`tar` bundles many files into one; `gzip` compresses. They are usually combined as `.tar.gz`.

| Command | Meaning |
|---|---|
| `tar -czf out.tar.gz folder/` | **c**reate, g**z**ip, **f**ile |
| `tar -tzf out.tar.gz` | **t**est: list contents |
| `tar -xzf out.tar.gz` | e**x**tract |
| `tar -xzf out.tar.gz -C /dest` | extract into /dest |
| `gzip file` / `gunzip file.gz` | compress or expand one file |
| `zip -r` / `unzip` | Windows-friendly zip |

```run
cd ~/lab
tar -czf ev-backup.tar.gz ev/config ev/scripts
tar -tzf ev-backup.tar.gz
mkdir -p restore && tar -xzf ev-backup.tar.gz -C restore
diff -r ev/config restore/ev/config && echo "restored copy is identical"
```

<!-- deeper -->
## Worked answers and common mistakes

The order to work in when a file system is full:

```term
$ df -h /var                                  # 1. confirm which file system is full
$ df -i /var                                  # 2. check inodes too (many tiny files can fill it)
$ sudo du -xh /var --max-depth=2 | sort -rh | head -15      # 3. find the biggest folders
$ sudo find /var/log -type f -size +100M -exec ls -lh {} \; # 4. find the large files
$ sudo lsof +L1                               # 5. files that are deleted but still held open
```

**Why deleting a huge log may not free space:** a running program still has the file open. The name is gone, but the data stays on disk until the program closes it. `lsof +L1` shows it. Fix: restart the service (or truncate the file instead of deleting it: `: > /var/log/big.log`). Then add **log rotation** so it does not recur.

Try the truncate-versus-delete idea safely:

```run
cd ~/lab
( exec 3> held.log; dd if=/dev/zero bs=1M count=3 >&3 2>/dev/null; rm held.log
  echo "file deleted, but this shell still holds it open:"; ls -l /proc/$BASHPID/fd/3 | sed 's#.*-> ##'; exec 3>&- )
```

:::warn Common mistakes
- **Deleting random files in `/var` to free space.** Find what is big and why first; some files (databases, journals) are vital.
- **Forgetting inodes.** `df -h` looks fine but "No space left on device" appears: `df -i`.
- **Deleting a log a service is writing** instead of truncating or rotating it.
- **`rm -rf` on a mount point** that is actually another disk.
- **No monitoring.** Alert at 80% so it never reaches 100%.
:::
<!-- /deeper -->

:::recap
- One directory tree; disks are mounted onto folders. `df -h`, `du -sh`, `lsblk`, `findmnt`.
- Full disk: `df -h` to find the full filesystem, `du` to find the hog, remove or move, check `df -i` and `lsof +L1`.
- Hard link = another name for the same data. Symlink = a path shortcut that can dangle.
- `tar -czf` to create, `-tzf` to list, `-xzf` to extract.
:::

:::try Your turn
`df -h` says `/var` is 100% full. List, in order, the commands you would run to find what to clear. Then say why deleting a huge log file might not free space immediately.
:::

:::quiz
? What does `df -h` show?
- Which files are largest
+ Free and used space per mounted filesystem
- Hidden files
- File permissions
! `df` = disk free (filesystem level). `du` = disk usage (folder level).
? You delete a hard link's original name. What happens to the other name?
+ It still works, the data remains
- It breaks
- It is deleted too
- It turns into a symlink
! Data is freed only when the last name is gone.
? Which command extracts a `.tar.gz`?
- `tar -czf`
- `tar -tzf`
+ `tar -xzf`
- `gzip -x`
! x = extract, c = create, t = list.
:::

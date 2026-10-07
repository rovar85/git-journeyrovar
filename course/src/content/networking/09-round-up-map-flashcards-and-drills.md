---
track: networking
title: "Round-up: the map, flashcards and drills for Linux networking"
short: Round-up
sub: One end-to-end map, flashcards made from every lesson, the tips nobody tells you, the few pages worth reading, and what to drill in round 2.
roundup: true
---

:::goals
- hold the whole track on **one map** and place every topic on it
- run the **gather, refine, drill, round 2** loop on this track
- drill the track's **flashcards** and the long procedures until they are boring
- know **which one to three documentation pages** to open, instead of reading everything
:::

## 1. The loop, for this track

1. **Gather (fast pass).** Go through lessons 1 to 8 quickly: read the goals and the recap, run the commands, skim the rest. Use the **notes box** at the top of each lesson to dump what you learn and what confuses you.
2. **Refine.** Turn the notes into a map and cards (section 2 and section 3). Draw the map from memory first, then compare.
3. **Drill.** Work the flashcards (section 3), then the **Your turn** tasks and quizzes in each lesson.
4. **Round 2.** Run it again only on what is left (section 6): long scenarios, new tools, edge cases, odd details.

Open the whole toolkit any time from the **Study** button at the top: [Method](#study/method), [Drill](#study/drill), [Maps](#study/maps), [Notebook](#study/notebook).

## 2. The map: One packet, from your app to another machine

Follow a single request down the stack and across the wire. Each networking topic is a hop on the path.

1. **Application name**: You use a name (service.example.com). DNS turns it into an IP address. Lessons: [6](#networking-6).
2. **Socket and port**: The app opens a TCP or UDP socket to IP:port; ports select the service. Lessons: [5](#networking-5).
3. **Transport (TCP)**: Three-way handshake, ordering, retransmission, timeouts; states you read with ss. Lessons: [5](#networking-5).
4. **IP and subnet decision**: Is the destination on my subnet? Masks and CIDR decide local delivery or gateway. Lessons: [1](#networking-1), [2](#networking-2).
5. **Routing**: The routing table picks the next hop (ip route); default gateway when nothing matches. Lessons: [4](#networking-4).
6. **Link layer**: ARP maps the next hop's IP to a MAC; switches forward frames on a LAN. Lessons: [1](#networking-1), [3](#networking-3).
7. **Firewall and NAT**: nftables/iptables filter and rewrite addresses on the way (chains, tables, SNAT/DNAT). Lessons: [7](#networking-7).
8. **TLS and verification**: Certificates, chains, SNI; ping, traceroute, curl -v, dig, tcpdump to prove each hop. Lessons: [8](#networking-8).

**Do this now:** [open the sketch pad for this track](#study/maps/networking), draw the path from memory, then reveal the map and fix what you missed. Paper or an iPad canvas works just as well. The map is a scaffold for recall: every topic in this track should hang from one of these hops.

## 3. Flashcards for this track

@widget drill_networking

Cards are generated from the track's quiz questions, recap sentences (with the key term hidden), command guides and "explain it" prompts. Rate each card honestly: cards you miss come back sooner. Add your own gaps as notes, and export to Anki from [Notebook](#study/notebook) if you prefer your own app.

## 4. Tips nobody tells you

- Test in layers, bottom up: ip a (address), ip route (path), ping gateway, ping IP, dig name, curl -v URL. The first failing step names the layer.
- ss -tulpn shows what is listening and which process owns it; a service bound to 127.0.0.1 is not reachable from outside.
- A ping that works does not prove TCP works: use nc -vz host port or curl to test the real port.
- dig +short name, dig @server name (ask a specific resolver) and dig +trace separate a DNS problem from a network problem.
- tcpdump -ni any host X and port Y answers 'is the packet even arriving?' faster than guessing.

## 5. Read only these pages

When documentation links to eight more resources, you usually need one to three pages. For this track, start here (links are given from memory of stable documentation addresses; if one has moved, search the site for the title):

- [ip(8) manual](https://man7.org/linux/man-pages/man8/ip.8.html)
- [ss(8) manual](https://man7.org/linux/man-pages/man8/ss.8.html)
- [Netfilter documentation](https://www.netfilter.org/documentation/)

## 6. Round 2: make these boring

- Given only an IP and a mask, say the network, broadcast, host range and whether two addresses can talk directly (do five by hand).
- Build a two-subnet lab with a router namespace, then break routing, DNS and firewall one at a time and diagnose each with the layered test.
- Explain what NAT does to a packet in both directions, using a table of source and destination before and after.
- Capture a TLS handshake with tcpdump and name each step.

:::try Your turn
1. Without opening the lessons, write the map for this track on one page. Then compare it with section 2 and mark the hops you forgot.
2. Drill this track's flashcards until nothing is "Again", then switch the mode to **Round 2: missed cards**.
3. Pick the longest procedure in the track and do it from a blank terminal against the clock. Repeat until it is dull.
:::

:::recap
- One **map** holds the whole track; every topic is a hop on it.
- The loop is **gather, refine, drill, round 2**: fast pass, compact map and cards, repetition, then only the hard parts again.
- **Flashcards** come from the lessons; the schedule brings back what you miss.
- Learn **one to three pages** of a new tool's documentation, and drill the **long procedures** until they are boring.
:::

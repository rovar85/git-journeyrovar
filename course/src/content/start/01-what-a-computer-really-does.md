---
track: start
title: "What a computer really does"
short: Computers
sub: The four parts inside every computer, what an operating system and a program are, how files and folders work, and what a server is, with no technical background needed.
---

:::goals
- name the four main parts of a computer and say what each does
- explain what an operating system, a program and a file are
- say what a server is and how it differs from your laptop or phone
- read the sizes you see every day: MB, GB, and what "64 GB storage, 8 GB RAM" means
:::

:::note Who this track is for
You have never written code and you are not "a technical person". That is fine. This track uses everyday words, explains every new term the first time it appears, and takes about three hours in total. After it, the rest of the course will make sense.
:::

## A computer is a very fast, very obedient cook

Think of a kitchen.

- The **cook** follows a recipe one step at a time. The cook is fast but does only what the recipe says.
- The **worktop** is where the cook keeps what is being used right now. It is small and is cleared at the end of the day.
- The **store room** keeps everything for the long term, even when the kitchen is closed.
- The **doors and hatches** are how things come in and go out.

Every computer, from a phone to the largest machine in a data centre, has the same four parts:

| Part | Kitchen | What it does | What you see in a shop |
|---|---|---|---|
| **Processor** (CPU) | the cook | follows instructions, billions of small steps per second | "8-core processor" |
| **Memory** (RAM) | the worktop | holds what is in use right now; emptied when the power goes off | "8 GB RAM" |
| **Storage** (disk, SSD) | the store room | keeps your files and apps when the power is off | "256 GB storage" |
| **Input and output** | doors and hatches | keyboard, screen, camera, and the network connection | ports, Wi-Fi |

Two things follow from this picture, and they explain most everyday computer problems:

- **Too little memory makes a computer slow.** With a small worktop the cook keeps walking to the store room. Opening many apps or browser tabs fills the memory.
- **Memory is not storage.** A phone with "128 GB" has 128 GB of store room, not worktop. Its memory is much smaller, perhaps 6 or 8 GB.

## Sizes: bits, bytes, MB and GB

A computer stores everything as tiny switches that are either off or on, written **0** and **1**. One switch is a **bit**. Eight bits make a **byte**, enough for one letter.

| Unit | Roughly | Everyday example |
|---|---|---|
| 1 kilobyte (KB) | a thousand bytes | a short text message |
| 1 megabyte (MB) | a thousand KB | one photo is 2 to 5 MB |
| 1 gigabyte (GB) | a thousand MB | one hour of video is about 1 GB |
| 1 terabyte (TB) | a thousand GB | a large external disk |

## Programs, and the program that runs them

A **program** (also called an **app** or **software**) is a recipe: a list of instructions written by a person for the processor to follow. A web browser, a game and a calculator are all programs. Writing those instructions is called **programming** or **coding**, and the text people write is **code**.

One special program starts when you switch the machine on and stays in charge until you switch it off: the **operating system** (OS). It is the kitchen manager. It decides which program gets the cook's attention, shares out the worktop, looks after the store room and controls the doors. You already know some operating systems:

| Operating system | Where you meet it |
|---|---|
| Android, iOS | phones |
| Windows, macOS | laptops and desktops |
| **Linux** | most of the world's servers, and inside Android |

Linux matters most in this course, because the machines that run websites and apps almost all use it.

## Files and folders

A **file** is one named piece of stored information: a photo, a song, a document, a program. A **folder** (also called a **directory**) is a container for files and other folders. Folders inside folders make a tree, and the location of a file in that tree is its **path**:

```term
/home/asha/photos/holiday.jpg
```

Read it from left to right: start at the top (`/`), go into `home`, then `asha`, then `photos`, and there is the file `holiday.jpg`. The ending after the dot (`.jpg`) hints at what kind of file it is. You will type paths like this within the hour.

## What is a server?

A **server** is simply a computer whose job is to **serve other computers**, not a person sitting in front of it. It has the same four parts, usually more powerful, and normally no screen or keyboard. It sits in a **data centre**, a building full of servers with strong power, cooling and network connections, and runs day and night.

When you open a shopping app, your phone is the **client** (it asks) and the company's computer is the **server** (it answers). The next lesson follows that conversation step by step.

Because a server has no screen, people control it by **typing commands** over the network. That is why engineers use a text window called a **terminal**, and why lesson 3 of this track puts one in your hands.

## Words you now know

| Word | Meaning in one line |
|---|---|
| Hardware | the physical parts you can touch |
| Software | the programs: instructions the hardware follows |
| Processor (CPU) | the part that follows instructions |
| Memory (RAM) | short-term working space, cleared when power is off |
| Storage | long-term space for files |
| Operating system | the program that manages the computer and runs other programs |
| File, folder, path | a stored item, a container for items, and the address of an item |
| Server | a computer that serves other computers |
| Client | the computer or app that asks a server for something |
| Data centre | a building full of servers |

:::try
Look up your own phone or laptop: how much memory (RAM) and how much storage does it have? On most phones it is under Settings, About. Which number is the worktop and which is the store room?
:::

:::recap
- Every computer has a **processor, memory, storage, and input/output**.
- **Memory** is the fast, temporary worktop; **storage** keeps things when the power is off.
- A **program** is a list of instructions; the **operating system** runs the programs and manages the machine.
- **Files** live in **folders**; a **path** is a file's address.
- A **server** is a computer that serves other computers, usually with no screen, controlled by typed commands.
:::

```quiz
? A phone is advertised with "8 GB RAM and 256 GB storage". Which is the short-term working space?
+ The 8 GB of RAM
- The 256 GB of storage
- Both are the same thing
- Neither
! RAM is the worktop: fast, small, cleared at power-off. Storage is the store room.

? What does an operating system do?
+ It manages the computer and runs the other programs
- It is the screen
- It is a kind of file
- It connects the computer to electricity
! It shares out the processor, memory and storage between programs.

? What is a server?
+ A computer whose job is to answer requests from other computers
- A person who fixes computers
- A very large phone
- A kind of keyboard
! It has the same parts as any computer, and usually no screen.

? In the path /home/asha/photos/holiday.jpg, what is holiday.jpg?
+ A file inside the photos folder
- A folder
- A program
- The operating system
! Read a path left to right: each name is a folder, and the last one here is the file.
```

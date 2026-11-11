---
track: start
title: "How the internet works, in plain words"
short: The internet
sub: Clients and servers, addresses and names, what really happens when you open a web page, and what people mean by the cloud.
---

:::goals
- explain what happens between tapping a link and seeing the page
- say what an IP address, a domain name and DNS are
- explain "the cloud" without using the word magic
- recognise the words request, response, website, app and API
:::

## The internet is a postal system for computers

A **network** is two or more computers connected so they can send messages to each other. The **internet** is the network of networks: millions of them joined together across the world by cables (including cables under the sea), fibre and radio.

Like a postal system, it needs three things:

1. **An address for every participant.** On the internet that is an **IP address**, a number such as `203.0.113.7`.
2. **A way to carry messages** from one address to another. Devices called **routers** pass each message along, hop by hop, like sorting offices.
3. **Agreed rules for what the messages mean.** A set of rules is called a **protocol**. The web uses one called **HTTP**; the secure version is **HTTPS** (the padlock in your browser).

## Names instead of numbers: DNS

Nobody wants to remember `203.0.113.7`. So websites have names, called **domain names**, such as `shop.example.com`. A worldwide directory called **DNS** (the Domain Name System) turns the name into the number, exactly like a phone's contact list turns "Mum" into her number.

## Follow one request

Press **Play**, or step through with **Next**. Tap any block to see what it does.

@widget viz_request

In words:

1. You type a name. Your **browser** (the client) asks DNS for the IP address.
2. The browser connects to that address and sends a **request**: "please give me this page".
3. A big site has many servers. A **load balancer** stands in front and passes each request to a server that is healthy and not too busy.
4. The server runs a program that prepares the answer. It may look things up in a **database**, a program that stores and finds information (your basket, the prices).
5. The server sends back a **response**. The browser draws the page.

All of that usually takes less than a second.

## Website, app, API

- A **website** is pages a server sends to your browser.
- An **app** on your phone is a program that talks to servers in the same way, but shows the answers in its own screens.
- An **API** is the menu of requests a server accepts from other programs: "give me the weather for Pune", "create this order". Apps talk to servers through APIs. You will use one later in the course.

## "The cloud" is other people's servers

Running your own servers means buying machines, a room, power, cooling and staff. Companies such as Amazon (AWS), Microsoft (Azure) and Google (Google Cloud) built enormous data centres and **rent out** servers, storage and ready-made services by the hour. That renting is **the cloud**.

So when someone says "our app runs in the cloud", they mean: it runs on servers we rent, in someone else's data centre, which we control over the internet. Nothing more mysterious than that. Your photos "in the cloud" are files on storage in such a data centre.

## Why this matters for a job

Almost every technology job in this course is about some part of the picture you just watched:

| Part of the picture | Who looks after it |
|---|---|
| The program that prepares the answer | software developers |
| Getting new versions onto the servers safely | DevOps engineers |
| The servers, networks and cloud accounts | cloud and platform engineers |
| Keeping it fast and working at 3 am | site reliability engineers (SRE) |
| The data it produces, cleaned and ready for reports | data engineers |
| Features that use AI models | AI engineers |

Lesson 4 looks at these jobs properly.

:::try
Open any website and look at the address bar. Find the domain name. Is there a padlock (HTTPS)? Then turn on aeroplane mode and reload: the browser cannot reach DNS or the server, so nothing arrives. That one experiment shows the client and server are two different computers.
:::

:::recap
- The **internet** connects networks; every participant has an **IP address**.
- **DNS** turns names into addresses.
- A **client** sends a **request**; a **server** sends a **response**. The web's rules are **HTTP/HTTPS**.
- A **database** stores information; a **load balancer** shares requests between servers.
- **The cloud** is rented servers and services in someone else's data centre.
:::

```quiz
? What does DNS do?
+ It turns a name like shop.example.com into an IP address
- It makes the internet faster
- It stores your photos
- It is a kind of virus protection
! It is the internet's contact list.

? When you open a shopping app, which is the client?
+ Your phone's app, because it asks
- The company's computer
- The data centre
- The database
! The client asks; the server answers.

? What is "the cloud"?
+ Servers and services rented from a provider's data centres over the internet
- Data stored in the sky
- A kind of Wi-Fi
- Your phone's memory
! It is other people's computers, rented by the hour.

? What does a load balancer do?
+ Shares incoming requests between several servers
- Stores files
- Translates names into numbers
- Draws the web page
! It also stops sending requests to a server that has failed.
```

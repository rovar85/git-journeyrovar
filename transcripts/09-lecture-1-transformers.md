# 114i2Kz-LZA

Source: https://www.youtube.com/watch?v=114i2Kz-LZA

Hello, everyone, and welcome to CME 295, transformers and large language models. My name is Afshine, and I'll be teaching this class with Shervine, who's in the back. So before we start, I just want to say a few words about ourselves. So Shervine and I are twin brothers, and we have very similar backgrounds.

So we both went to a school in France called Centrale Paris. And then we came to the US for grad school. So on my end, I went to MIT. And then Shervine came here at Stanford in the ICME department. And then after that, we both went to the tech industry. So we first both went to Uber, and then we went to Google. And now we're both at Netflix. So Shervine and I, we like LLMs.

So we've been working in the field of LLMs, I would say since the early 2020s. And so that's one of the reasons why we're so lucky to be teaching this class. We've been teaching it since 2021 under various formats. But as attention gained towards LLMs, we have actually made it an actual Stanford class since last year.

And this session is the third instance. And so if you're here wondering if this class is good for you-- so the goal of this class is to tell you how LLMs work and in particular, understand the underlying mechanism of its architecture-- so we're going to see the transformer-- but also how LLMs are trained, how we can use them, what they're good at, what they're not good at. So hopefully, you'll be able to get a sense of all

of that in this class. And in terms of the target audience, I would say it's a pretty wide audience. So in case you want to go and be a research scientist, I would say it could be a great class to just open up the set of things that you are able to see in terms of, what are the different techniques that are being used, what are the different applications, and so on.

So I think that's one. The second one is if you want to do a personal project. So nowadays, coding agents are everywhere. And so if you want to just take one tool and just do something, you should probably know what the coding agent is good at and not good at. And third, I would say no matter your role, there is a growing need of being literate in AI.

So there's this term called AI literacy. So no matter where you work and your role, I would say just knowing how these tools work is becoming increasingly important. So if you feel like you're in one of these categories, this class may be good for you. And in terms of the prerequisites, I would say if you have some foundations in linear algebra,

if you know what a matrix is, how we do multiplications, then that would be great-- along with some basics in ML. So for instance, what is a loss function, what is a neural network, what is an embedding, although we will be seeing that in the class. But it's good to have those, I would say, beforehand. Make sense? OK, cool.

So you may or may not know that this class is being recorded. So you can see the camera in the back. It was actually recorded last year. So you may be wondering, well, what is the point in attending the lecture if it was already recorded? So the field is moving so quickly that there has been so many new things that

have come up since last year. And actually, one of the goals of this class is to incorporate all the advances that have happened. So I'll name a few. So there has been some progress on the post-training side. So for instance, on policy distillation, if you've heard of it, of course, AI agents, so coding agents and so on,

and new paradigms of LLMs. So traditionally, it was predicting tokens one at a time. But nowadays, there's been an increasing number of models that have approached things differently, so from the diffusion perspective, among other things. So long story short, if you're attending this class and you're preparing for exams, please look at this year's lectures because they

will be quite different. In terms of the logistics-- so I'm so happy to see so many of you on a Friday afternoon. So it will be every Friday from 3:30 to 5:20. It will be in this class. And then it is a two-unit class. You can either choose it to take it as letter or credit, noncredit.

So again, all the lectures are recorded. We'll make sure to post the recordings, at most, two days after the lecture has happened. So feel free to watch it remotely if you want or attend the class in person. Actually, we'd love to see you in person, so feel free to choose either way. And this class has no homeworks, but it has two exams.

So one is the midterm, and one is the final. So the midterm will be about the first four lectures, and it will be one month from now, I guess? Yeah, October 23. And the final exam will be on the last five lectures. So there will be nine lectures in total. And it will be accounting for 50% of the total. So given that it's not the first time

that we're giving this class, we have already posted online what a midterm looks like, what a final looks like. So if you go on the website, you can actually see in the tab 2025 what we would expect from these exams. So it's a multi-choice questions. We also have some free-form questions. So this is the kind of question we would ask.

Any questions on the logistics so far? Yeah. So I'm going to always repeat, by the way, questions just for people who are watching remotely. So the question is, are there office hours? So we don't have official office hours. However, Shervine and I will be staying after each class in case you want to ask any questions.

And we're going to see it actually here in case you have any-- So we're going to see it later if you have any questions. There is also Ed, so platform where we can ask questions. So yeah, we'd love to answer them. Cool. So in terms of the material-- so I was talking about the midterms and so on.

So they're all-- so the ones from last year, they're on the website. The website also contains the syllabus, and the recordings will be posted there. One thing that we're doing is that we're posting the slides one day before the lecture because last year, some people came to us and said, OK, we'd love to be able to annotate on the slides.

So now, we took the habit of posting them one day before the lecture. So if you go on the website, you can retrieve them. So in terms of the material, we do have a textbook, which is this one, the Super Study Guide, Transformers and LLMs. I believe the library has a few copies, so you can borrow from there.

You can also get it online. We got the website as well. And along with that, we also have a cheat sheet which aims at being the most up to date. So Shervine and I actually updated it just a couple of weeks ago. And that one aims at covering the whole content in a concise way.

So maybe it's a good companion for studying right before each exam. And also, I know a lot of us are international people. In case you don't see your language being translated, feel free to come to us. We'd love to partner with you. So right now, it's available in, I believe, 15 languages, including English.

So yeah, I'd love to see more languages as well. Cool. In terms of how we communicate-- so we will post announcements on Canvas. And you can also access it through Canvas. But if you have any questions that you want to ask us in private, we can also answer through the mailing list that

is on the slide, along with our Stanford emails. I think I'm done for the logistics. Is there any question? Is it scary? Because we had only one question. Just wondering if there's any that you may worry. Is everything clear, super clear? Yeah.

So the question is, will we see how this ties back to what is practiced in the industry? The answer is yes. So one of the things we'll be seeing, especially in the second part of this class is how we can apply those LLMs in different settings. And so just as an anecdote, so last year, I remember there were some things that

came up that were released as we were teaching the class. And so we updated the content as we went. So I'm sure we'll do the same thing this cycle as well. So yeah, the answer is yes. Yeah. So the question is, what is the recommendation for preparation given that there is no homework, and then it's 50-50 midterm-final?

I would say depending on how you usually study, I think, just studying regularly, I think, works best. I would say just paying attention to things that we're covering in the class, during the class, I think, is most important. So there may be topics that are in the textbook that we're not covering, and I would say those are not expected in either exams.

So roughly speaking, anything we say can be in the exam. So question is, do you have any practice problems? So yes. So last year, we said no. But now yes, you have the 2025 ones. So yeah. But the questions will be different. So yeah.

OK, great. So one thing is we only have two hours or one hour and 15 minutes per week. So we will have nowhere near the time to cover everything. So one thing that we'll be seeing in each of the slides that we'll be talking over is always-- I mean, most of the time-- a source at the very bottom of the slides that

is meant for you to check in case you're interested to learn more details. So feel free to refer to the slides in case you're interested in a topic that maybe we've covered for a few minutes, but you want to learn more. Cool. Another thing-- I mean, something that I personally have felt when I first started in the NLP field

a few years ago, there are so many abbreviations all over the place. And it can be intimidating. So our hope is that in case you're feeling overwhelmed today by these abbreviations, that by the end of this class, you'll have a mental mapping of which abbreviations correspond to what concepts.

So there is our goal. And with that, we're going to start by asking ourselves how we got here. So 10-15 years ago, in the 2010's, so I remember, the field was completely different. We didn't have one model that did everything. We had typically one model per use case. So the kind of model that was dominating the field

was RNNs, Recurrent Neural Networks, which we'll briefly see in this lecture. And you had these use case specific models, such as for sentiment extraction. So you ask yourself if a sentence, a review is positive, negative, or neutral. If you had a text you wanted to translate, you had a dedicated model for that.

And if you had-- I don't know-- text, you wanted to identify names, locations, and so on, you would also have a dedicated model for that. So this was in 2010's. Performance was OK. But the thing that really made a true difference that was a turning point was 2017. So 2017, there's a paper that came out,

that we're going to talk about at length today, that's called "Attention is All You Need," that introduced a new architecture that relied on a paradigm, that proved to be very scalable. By scalable, I mean, if you give your model more data, more computes, and more parameters, you're actually able to see performance gains that are far greater compared to what you used to see before.

And it's something that we're going to see today. So this architecture is called the transformer. And on the right, you have an illustration of how it's illustrated in the original paper. We're going to see how it works. And from there, people have taken this architecture and just scaled it from a model size perspective but also from the number of tokens it's been trained on.

And this is how modern-day LLMs have come into the picture, lLMs that actually know-- I mean, that actually generate texts pretty well, that generate code pretty well. And in particular, in 2022, ChatGPT got released. So I remember in November, I believe. Yeah. And again, it was a turning point

from more of a product perspective because before that date, people were not really used to interacting with the chatbot. So I believe that release was really the first time that people got introduced to that aspect. And I think even the person or the company who launched it probably didn't even realize how big it would get.

I mean, I'm assuming because in their tweets that released the model, I believe they had a typo, which I find funny because nowadays, whenever there is a model release, there is 10 times review of what the wording is. So I'm assuming that this was not the case for the announcement here. But yeah.

So that is also another turning point. And then here we are, 2026. I'm assuming a lot of you or all of you are interacting with coding agents almost on a daily basis. So we're going to see how we got to that stage, how we went from a conversational LLM, conversational assistant, to actually agentic behavior. So we're going to see that, especially

in the second part of this class. So far so good? Cool. So with that, we're going to start with one foundational concept, which is tokenization. So what is tokenization? So when we talk about text, text is not really something that models can understand.

Models understand numbers. They don't understand text. So the first goal is to find a way to represent that text in forms of something that models can understand, so in forms of numbers. So the way that we do that is we first try to divide the text into entities that we can then represent.

And so the process of dividing the text into indivisible entities is what is called tokenization. So in this example, we have "A cute Teddy bear is reading." And one possible tokenization is to say that "A" is one indivisible unit. "Cute" is another unit. "Teddy bear" can be another unit. And so on and so forth.

So each of these elements is called a token. And our goal is to represent these tokens with mathematical representations that are meaningful. So in this case, we want each token to be represented by a vector, a vector of numbers. So in order for you to tokenize an input text, you need to know, what are the tokens that are

allowed for you to be using? And so we have something that's called a vocabulary which includes all possible tokens that you can use. And depending on the vocabulary that you choose, you may end up with different sequence length. So here, by sequence length, I mean the number of tokens, by which you divided your text.

So for instance, in this instance, we have 1, 2, 3, 4, 5, 6, six tokens. We're going to see in a second that there is a tight relationship between vocabulary size and sequence length, and that's something that will inform which tokenizer we should be choosing. So far, so good? So now, you may be wondering, well, all of that is great,

but how do I know how I tokenize my text? This is just a theoretical concept, but how do I do that? So one natural way is for you to say, OK, so I'll just tokenize the texts with respect to words. So I'm going to consider space as being a delimiter between tokens. So here, I would say "A cute Teddy bear is reading." So every word in that text would actually represent a token.

So what are the pros and cons of this approach? So pros, very simple, especially for the English language, you map a token to its words, very simple. It is also interpretable, as in you know when you get a representation of a word that it corresponds-- or a representation of a token that it corresponds to a given word. However, at least in English, you

have many variations of words. So, for instance, a noun, you can have it as singular and plural. You can have the masculine form, the feminine form. You can have many, many variations. So your vocabulary size may get very large as a result of that. So that's one con. The second con is, we're going to see in a second,

that when we learn the representation of each token, there is nothing that guarantees us that two tokens that represent the same thing would get the same representation. So, for instance, if you consider the word "bear" and the word "bears," these are the singular and plural of the same animal, which is a bear. And so you wouldn't want the representation of these two

tokens to be too far from one another because they represent the same thing. Well, with this way of tokenizing your text, you would have a hard time, first of all, leveraging the knowledge that you have from the similar token, and second, just guaranteeing that these representations are similar. And then the third one is, well, given that you need to learn

the representation of each of these words-- so one word is one token-- you may run into a case where if you train your tokenizer on a given corpus of text, that you actually do not have a given word that you then encounter at inference time. So you may actually be missing representations that you could not have had the chance to learn,

just because you did not encounter that word at training time. And therefore, you can run into the risk of out-of-vocabulary, meaning that a token is actually not something that you have seen at training time, and you don't have the representation for that one. So long story short, word-level tokenization is simple, but it comes with a few cons.

And one of the cons is really the fact that you are not able to leverage words of similar roots. And this leads to vocabulary being large and risk out-of-vocabulary. So the next question is, OK, can we do better? Is there another way of tokenizing the text that could make more sense? So a natural thought could be, well, you don't divide by words,

you divide by a character. You have a fixed number of allowed characters, at least in English or in any languages. And so you are not running the risk out-of-vocabulary anymore because you will encounter all the letters in the alphabet in your training set, or you can try to do that. And by doing so, you will also have a small vocabulary. And you would also be robust to casing and misspellings

that people usually make when-- I mean, I'm not sure if you recognize yourself, I do. So when I type-- I don't know-- on my computer, I sometimes misspell things. And I wouldn't want the representation of a word I meant to write to be different from the actual word. And so here, we would not be going into the case of not recognizing a word just

because it is misspelled. But we will see that if you do that, the sequence length is going to get much longer. And model complexity is a function of sequence length. So the sequence is very long. Then your model will take a long time to process the sequence. So it will make computations much slower. And the embeddings themselves, they're much less interpretable

as in-- if we tell you the letter A has this representation, it's maybe much more abstract than talking about word representation. And we will see that in a second. So far, does that make sense? Yeah. So I hope I am motivating a trade-off enough that the next natural thought in your mind

is to actually try something in between, so not word, not character, but in between, so subwords. So how about we tokenize the text by leveraging knowledge that we have about words that we can learn from some training corpus? And we divide common occurrences of letters, and we represent them with a token. So for instance, for reading, we would represent "read"

with a token and "ing" with another token. So how about we do that? So the good thing here is that we would leverage the root of words. So in my previous example, "bear" and "bears" would have the, for instance, "bear" token in common. And then the second thing is it would be actually learned from the data, as in the way you tokenize text is informed by how

words are actually written. But then the con is, well, you need to do that extra work. So in the word-level case, you just need to produce tokens by just dividing based on space. So here, you would do-- you need to do some extra work. And then the way you obtain these tokens will be highly dependent on the type of data that you have when you do your tokenizer training.

So that's another thing, another con. So we need to make sure that the data that you use to learn how to tokenize things is actually aligned with your end goal. So I just want to say something here. So I talked about three ways of tokenizing texts. So word level, character level, subword level Among the three, subword level is by far the most popular nowadays,

for all the reasons that I mentioned. And you'll hear the word or the acronym BPE a lot. So BPE is a type of subword tokenizer that stands for Byte Pair Encoding. So the paper is linked at the bottom of the slide in case you're interested to learn more, but I'll give you just the gist of how it works. So BPE learns what tokens should be in your vocabulary

by starting from an initial set of tokens and identifying the most frequent pairs in your training data and by coming up with dedicated tokens for merged tokens of these pairs. So for instance-- I'll give an example. Let's imagine your initial vocabulary is all the letters in the alphabet. And you have, I don't know, the word "an," like "an idea,"

"an amazing course." So "an," that occurs very frequently. So here, it will say, OK, "a" and "an" appear very frequently together. So let's actually add a token that merges the two. It will add that new token in the vocabulary, and then repeat the process until reaching a desired final vocabulary size.

And that will be your final vocabulary. So the nice thing is that these tokens are learned from the data, so things that appear together are actually identified and added to your vocabulary. So this will lead to your sequence length being shorter. So you will not have to decompose your text into that many tokens. So your model will not take that much time to process your texts.

And so that's where the efficiency comes from. So if you have a training corpus that has, let's say, a lot of the words that you encounter in practice, then the sequence length of the tokens you will get from a piece of text that uses the same words as what you had in your training corpus, will be much shorter. So in case you're doing multilingual work,

then make sure that your tokenizer is trained on a corpus that represents all the languages that you're interested in. That's one example. So that was a lot. So I'll just pause for a second. Is there any questions so far on this part? Yes.

So the question is, what is the relationship between BPE and n-gram? So n-gram is actually something separate. And this one, yes-- to your point, it will learn the tokens from your corpus by merging the most frequent pairs in an iterative way until reaching a final desired vocabulary size. So next natural question is, OK, you have your tokens, then now,

how do you know how to represent them? Maybe you're asking yourself this. And we will see that actually in about five minutes. So more on that in a bit. Actually, I'm looking at the time. I don't think I'm on time, so I'll probably move on. But if you have any questions, please feel free to interrupt me.

Tokenization is really the building block of everything we'll see from here, so yeah. So far, we've seen tokens that represent texts that we want to tokenize. But the truth is we also have some special tokens. And these special tokens are meant to represent things that we want to express in sequence. So one such token is whenever we encounter

a term or a piece that is actually not something that is part of our vocabulary. So the convention is to have a dedicated token that represents this out-of-vocabulary piece of text, and it's called the unknown token. So it's one special token. So I give an example, "Teddy bear." Imagine if I write it Teddy DI bear.

And in the training corpus, we've never seen such a spelling. Then if your vocabulary is only composed of these four tokens, so Teddy, cute, bear, and unknown, then Teddy bear will be tokenized as unknown token, and then bear. One example-- Another set of special tokens-- so a lot of the times,

you need to indicate when the sequence is starting, when it is ending, and we'll see how we do that. So we have two sets of special tokens. One is beginning of sequence, BOS, and then end of sequence, EOS. Those are mostly used when we want to generate text. So for instance, when you want to start the generation, the convention is to feed your model

with the beginning of sequence token, just to indicate to your token-- to your model that you want to generate text. Your model will then, at the end of its generation, just output the end of sequence token to just tell you that its generation is finished. So this is how it's used. So "What a cute Teddy bear" would be beginning of sequence,

"What a cute Teddy bear" and end of sequence, as an example. And then the last one that you may encounter is the padding token. And that one is meant to make your sequences be of a certain size. So this is sometimes used for efficiency perspectives. If you want all your sequences to be of the same length, because we'll see that we can represent that with vectors,

matrices, tensors-- and hardware loves things that have the same dimension-- then padding can also be used. But I want to say that this list is by no means exhaustive and that you also have a lot of different conventions that people take. So this way of writing, BOS, EOS, this way of writing padding, it's not universal.

So just don't be surprised if you encounter different variations. And nowadays, you have things like assistants. So you have a user, assistant. And those are other things that people represent with special tokens. So again, this is not an exhaustive list. But just know that such tokens exist,

and they are meant to convey something about the text that the model should understand. Cool. That's it for tokenization. Any questions? Yes. The question is, what is the order of magnitude of the vocabulary size for LLMs right now?

So it's a great question. It is on the order of hundreds of thousands. So you will see something like hundreds of thousands, 200,000, something like this. And these are tokenizers that are able to handle both English but also other languages. And as I mentioned, the most common type of tokenizer nowadays is the BPE one.

So yeah, so these are the things that are good to have in mind. Yeah. So the question is, having multiple languages be handled by your tokenizer, does that make your tokenizer a bit less of an expert in a given language? I think it is hard to say, I would say, because there may be some synergies between languages. So I would say it's hard to say in general.

But that being said, the vocabulary size that you fix when you run your BPE algorithm will be filled with tokens from different languages. So you may get a vocabulary that may lead you to longer sequence length if you're only interested in one particular language. So from an efficiency perspective, maybe you'll see something. But then from a representation perspective,

it's not super clear. So one example is acronyms of organizations that maybe something that people talk about in a bunch of languages. So you may benefit from learning that representation from different texts of different languages, so pros and cons. Great.

Cool. So now, what we know, what we have learned is given an input text, we're able to generate tokens or represent that text with tokens. So the next natural question is how to represent those tokens. So this is what we're going to see now. So the most naive way to do that is to say that each token is different.

So it's extremely obvious. But you can represent your tokens by what we call one-hot encodings. So here, let's say I have the token soft. I can say, OK, it's the 1,0,0 vector. And if you do that for all your tokens, well, the bad thing is they're all going to be orthogonal to each other

if you take the dot product. So is it a good thing? No. It's not a good thing because it doesn't tell you anything about what these tokens are and how they're related to each other. So it's not what you want. What you want is to represent these tokens

in a way that reflects how similar they are to one another. That is what you want. So, for instance, you want "Teddy bear" to be similar to "soft" because Teddy bears are soft, but maybe book to be maybe independent. This is what you want to learn. You want to learn meaningful representations. And by the way, why do you want to learn

meaningful representations? Well, it's because you want to do something with your text. You need to have it as input into your model in order to do something as output-- so for instance, generating the next words, predicting some class. So you need to understand what is in your text, which is the reason why what you want is

meaningful token representations. So this is what an earlier method called Word2vec tried to achieve. So here, the idea is to learn these representations through what we call a proxy task. So a proxy task is a task that you're trying to learn, but it's not the task that you're trying to learn as an end goal.

It is a task that you try to learn in order to achieve something else. And here, the proxy task is something like predicting the word that is in between some context words-- so this is the continuous bag of words version of Word2vec-- or predicting words that are surrounding a given word. That is the skip-gram version. So we'll go through an example so that it becomes clear.

So, does everyone know what a neural network is? Yeah. OK. So I represented a very basic neural network. So you can think of it as an input matrix multiplication to get a hidden representation of size D and then again, matrix multiplication to go back to size V or vocabulary size. So let's assume that you have the sentence "A cute Teddy bear

is reading." And let's assume, for the sake of simplicity, that your goal is to predict "cute" from the word "a." So let's imagine that your proxy task is to predict the next word. So here, "a," you're very naive representation of "a" is the one-hot encoding. So let's assume that you have a vocabulary size of six,

and "a" is your first token. So you would represent "a" with 1,0,0,0,0,0. You pass it through your network. So think of it as matrix multiplication with this vector. You would have a hidden state of size 2, to assume two numbers, 0.2 and 0.9. And then you pass it through your network, so again, another matrix multiplication.

And then you have predictions that sum to 1. So you can use something like a softmax to normalize them. And your goal is to have these probabilities be as close to the label that you have, which is predicting the word "cute." And so "cute," let's suppose that it's the second word of your vocabulary. So it is represented by 0,1,0,0,0.

Your goal is, like on the slide, for the 0.4 to be as close as 1 as possible. So the idea is to have a loss function that penalizes the fact of having a probability of a given word being too far from the word that you're trying to predict-- so in case you know the cross-entropy loss-- and then updates the weights of your model in order to reflect what you want.

So just so that we're clear, I will just walk through all the quantities that we mentioned. So here, the one-hot encoding that represents the token is of the vocabulary size. The hidden state or also called latent representation is of size D. And D is actually a parameter that you can choose, typically much smaller than the vocabulary size. And then the predicted word probabilities--

well, you have a probability per token, so it needs to match the vocabulary size. So it's of size V. And it also matches the size of the one-hot encoding. And this is where you're able to try to penalize for deviations from the word that you're trying to predict. So let's assume you do that for "a" trying to predict "cute."

You repeat the same thing for "cute" for "Teddy bear." So you go "cute." You represent it with the one-hot encoding. You pass it through your network. You have a latent representation and again, probabilities. You compare that with the actual label that is representing "Teddy bear." Compute the loss.

Update the weights given how far you are from the label. And you repeat that through your whole corpus. Well, at the end of this, what the authors realize is that the latent representation that you learn in the middle of the network actually is making sense, as in you can compute similarity measures between the learned representations.

And you see that representations of similar tokens are actually similar. So in this example, so Teddy bear is soft, what is Persian poetry to art. So another example is Paris is to France, what Berlin is to Germany. So you have these nice associations that are actually something that the model learns.

So that gives you meaningful word representations. So that's a method that appeared, I believe, in the early 2010's. I believe it was 2013, if I remember correctly. So who can tell me what is a limitation of this approach? So here, the representation of the words that we learn-- we saw that they end up being meaningful. But is there a limitation to this approach?

Yeah. So one answer is that you would have trouble if you actually are not encountering something that you have seen during your training process. So yes, that is right. And I think that's right in actually most cases, beyond that case in particular. So that's one.

Is there another-- yes, another limitation? So the answer here is the dimension scales up when the vocabulary size gets bigger. So actually, this is a limitation of your tokenizer because the tokenizer is the one that determines your vocabulary size. But you're right that this is a limitation. But it's not specific to that approach,

as in you will always need to find a representation of each element in your vocabulary. So, I mean, it's a limitation but limitation in methods in general. Yes. Oh, yes. So the answer is words can have multiple meanings. So exactly.

So one limitation here is if the word, let's say "cute," is in this sentence versus in another sentence, they will both get the same representation. So if you say cute Teddy bear in a nice way versus someone who sarcastically says, oh, how cute, they may mean different things between the word-- behind the word "cute." So I think a very classic example is "bank,"

so river bank versus going to the bank. These are the same words but different meaning. So the problem with this approach is that the representation of this word would actually be the same regardless of the sentence that it is in. So great point. Another limitation here is that the word order does not matter.

So let's assume we're saying the child is hugging the Teddy bear, and the Teddy bear is hugging the child. These are the exact same words, but they mean different things. We would get the same embeddings with this approach in both cases. So these are all limitations, which is the reason why this is something that people have tried to resolve through different means.

One such means is RNNs, which, as we previously saw, was the type of model that was dominating the models back in the 2010's. And so here, RNNs, what they do is that they actually have an extra quantity that they compute, which here is represented with A. There is also called a hidden state that tries to encapsulate the meaning of the sentence seen

so far. So we're going to see that as an example. So let's assume we go with the same sentence. So a cute Teddy bear is reading. So here, you would actually put the word into the RNN. It would try to predict the word "cute." But then what it will do is keep what we call a hidden state that encodes the meaning

of the sequence seen so far. That will be an input to the next prediction. So we'll have "cute" as an input and then this hidden states as an input as well in order to inform the next representation, and so on and so forth. So here, what you're doing is you're not just considering embeddings of tokens on their own. You're also considering the embedding

of the sequence decoded so far. And that allows you to take into a consideration the order of the words in the sentence. And RNNs are actually models that were used in a bunch of tasks back in the day. So, for instance, for classifications, what you would do is process tokens one at a time and then keep a self-mutating state that

encodes the meaning of the sequence seen so far. And it would try to predict, let's say, a sentiment in the sentiment extraction case. In the multi-classification case, for instance, if you wanted to determine if a word was a noun or a verb, then you would actually leverage the representations corresponding to each input, which again, would

take into consideration the hidden states or just generation. But one limitation of RNNs is that-- OK. It was great you would consider the order at which the words would appear in a sequence. But it would have trouble remembering words that happened far in the past, because what it used to do

was to encode the meaning of the sequence in one single vector that kept on being modified. So you had this issue of what we call long-range dependency, where if you end up two sentences after something that you have talked about prior to that would have trouble teasing that out just using the hidden state at that point. And that can be problematic, for instance,

when you refer to something that happened in the past. So for instance, you can say, oh, my Teddy bear is so cute. It is 3 feet tall. So "it" refers to something that is in the past. So now let's assume that "it" I'm using is referring to something that is far in the past. Then we have this problem of actually having the right set of information in the hidden state

that we're considering. So this is the reason why there were some variations of RNNs. One such variation was called LSTM, Long Short-Term Memory, which tried to address this problem, by not only keeping a hidden state but also another state called the cell state that was meant to carry information for longer. But the truth is even such variations

had their limitations, which, again, had the same issue. So if we were to just recap the state of the ways we could obtain our embeddings so far, we saw Word2vec, which is a very simple approach to compute representations of words. But the problem is that if a word is, let's say, in a different sequence, then the representation is the same.

So that is a limitation. And also as mentioned previously, the same word can actually mean different things. And so that is also not conveyed. And in the case of RNNs, we are actually addressing the word order problem by having a hidden state that encapsulates the sequence that is seen so far.

But the problem is that we have this long-range dependency problem. That is actually coming from a deeper problem called the vanishing-gradient problem, which is a problem when you want to backpropagate, that just introduces some limitation. And another thing that we have not mentioned, but RNNs, the problem is every time you want to predict the next token,

you need to have the hidden state that encapsulates all the things that you have seen so far. So you always have to just go through tokens one at a time in order to make the next prediction. And when it comes to training such a model, it is just extremely slow. And it had great results at the time but not amazing either. So for all of these reasons, in the 2010's, people

tried different techniques. And there is one technique that really stood out now from hindsight, but that is called attention. And the idea is as follows. Instead of solely relying on the hidden state to encapsulate the meaning of the sequence that you have seen so far, the idea is to let your model have direct connections from tokens

that you have seen in the past. So in other words, we're not saying only rely on the hidden state to know what has happened in the past. We're saying you can also have direct connections to tokens that you have seen in the past in order to predict the next token. So in the translation example, so let's assume you want

to translate in French, "A cute Teddy bear is reading." And let's assume you say-- [SPEAKING FRENCH] And you want to predict the next word. So intuitively, in order to predict the next word, it would be amazing to know what the word that you want to translate is. So in the traditional RNN case, you

would not have access to that-- direct access to that word. You would only have access to it via the hidden state. So here, the idea is to have a direct connection to previous tokens and let the model learn which ones matter. And here, for the prediction, to rely on the ones that matter in order to make the prediction. So this is the concept of attention. The concept of attention is letting your model

draw direct connections from a given token to some tokens in the past. And this concept is very important because it is at the foundation of what we're going to see now. So I mentioned previously that there was this paper called "Attention is All You Need" that came out in 2017. That was a turning point because people saw that it was very scalable.

It was giving you amazing results. Well, this paper relies on the concept of the self-attention, which is attention but on steroids. And we'll go through exactly what we mean by that. So let's assume you have the sequence "A cute Teddy bear is reading." So now the idea is to not say that we're going to compute the representation of a given

word as a function of the hidden state that encapsulates the meaning of the sequence so far and the word itself. We're not saying that. Now what we're saying is that in order to compute the representation of a given token, we can actually do that by expressing that representation as a function of all the other tokens in that sequence. Sorry?

So I think you raise an important point, which is, how do you know the order of words if you just let everyone interact to everyone, in case that was your question. So if you let a token interact with all other tokens, you actually lose the concept of word order. And it is actually something that is addressed later on. So we're going to exactly see that part.

But here, you actually do not know where tokens are because you have a direct connection. In this very vanilla representation, you don't know where tokens are. So we're going to see exactly how you fix that issue. But does the idea make sense? The idea that in order to compute a representation of a token, you actually

want to express that as a function of all the other tokens in the sequence, does this idea make sense? Roughly? Yeah, I'll take that as a yes. So we're going to go through examples. And actually, Shervine has a detailed example later on. So hopefully that will make a bit more sense.

There is a set of notations that people use that we're going to introduce now. So these notations are queries, keys, and values, Q, K, and V. So the query is the entity that is trying to determine what a given token is about. And the idea is it wants to find tokens that are useful in order to construct a meaningful representation of the token that it is responsible for.

So the query for Teddy bear, what it tries to do is to find other tokens that is relevant in order to compute a meaningful representation of that token. So what it will do is see how similar that quantity is to keys of the sequence that are associated with each token in the sequence. And once it determines the magnitude at which it is similar to each token, we will associate a value

to each of these tokens. So in other words, we want to express the representation of Teddy bear as a function of all the other tokens in the sequence. So what we will do is first determine the weights. So it's a weighted average. We want the weights. The weights are determined by how similar the query for Teddy

bear is to each key. And then the actual value will be just the value vector corresponding to each token. So it will be something like-- if I were to write it, so it's like the sum of something that is representing the similarity. So Q and Ki, Vi. So this is your query.

You're trying to determine how similar your query is to all the other keys with some similarity operations. So here's the dot product as an example. And you associate that. So this is a scalar. This is a scalar. And you associate that with Vi which is also a vector. So this may seem a little bit abstract,

so I'll give you an example. So let's assume we want to know what best describes the Teddy bear. The query can be asking itself, OK, what best describes a Teddy bear? And you look at all the tokens. You're like, oh, "cute" actually describes the Teddy bear pretty well.

So maybe the dot product between cute, Teddy bear, and K cute is going to be high. So the representation that you compute for Teddy bear is actually something that will depend heavily on cute, let's assume. So these are the concepts of query key value. Now the next question is, how do you obtain those? How do you obtain queries key values?

So these are actually quantities that you can learn with projection matrices. So you initially have some input token that represents each token. And what you do is you take that representation, and you project it on the space of queries, of keys, of values through some projection matrices. And then you use these quantities

in order to compute meaningful representations of tokens. Yes. Amazing question. So the question is, what is the T? So T is actually just to be mathematically rigorous. So T is transpose. So it's just that this, you can also write it as QK transpose. Any other question?

So we have a detailed example later. So in case that roughly makes sense, I think that's great. We'll see that in a second. So it just turns out that what I described is something that is very nicely-- something you can express in mathematical terms with matrices. So in particular, the operation I just mentioned is something that can be expressed

as the softmax of the query and the keys. And you scale that by some factor times the values. And actually, I maybe have enough time for you to say why. So let's assume you have-- so the softmax is just a way for you to get the sum of the coefficients being equal to 1. So that's roughly what it does. But the question is, well, if you have query key transpose V--

I mean, more or less the softmax and the scaling, why does it give you the thing that we saw above? Well, let's assume that your query matrix has all your queries, so Q1, Qn. So 1 is the first index of your sequence. So let's assume in the previous slides that we say the first index is A. Let's say A is 1. And then the dot is n, let's assume.

So we have the query for A up until the query for the dot. And you do the same for K and V. So if you multiply this query matrix times Q transpose, what you get is K1, like this, Kn. And so this is where you're glad some linear algebra. So matrix multiplication-- so you do this times this, which is the dot product of Q1 K1. And then second element is Q1 K2.

So if you repeat this, you will have the matrix of the QIKJ. I'm going to maybe write that up up there. So I'm just going to write exactly what is above. So you have-- Q1 K1. Up until Q1 Kn. And then you repeat that here. You put that here.

You repeat that here. Now if you add a V in here, then what you obtain is V1 Vn. So again, you do your matrix multiplication. And here, what you get is-- this times this plus this times this plus this times this, up until here. So you have the sum of Q1 Ki Vi. And the same up until the sum of Qn, Ki, Vi.

So long story short, I just wanted to say that the fact of expressing something as a function of this similarity operation and the values is something that you can represent very well with matrices. And you will see this formula quite often. So I believe there was a question on the midterm. So hint, this formula can be important.

And so now that we know how self-attention is defined, how self-attention works, now we're going to, hopefully in the next 17 minutes, see how self-attention is used in the transformer architecture, which is a-- which is the architecture that was introduced in the "Attention is All You Need" paper. So why is it called "Attention is All You Need?" Well, the authors at the time, most models, were recurrent.

They were based on RNN. So they used to compute things in a recurrent fashion. But here, what we're saying is actually, we don't care about keeping a hidden state by recurring through tokens. We're not doing that. What we're doing instead is letting tokens interact with all tokens through direct connections, a.k.a.

through self-attention, which is why attention is all you Need. So this paper was released in the context of machine translation. So in this context, we're interested in translating a source text, let's say in English, over to another language, let's say in French. And what we do is we have two components in the transformer.

On the left, we have what we call an encoder. And the role of the encoder is to compute meaningful representations for the source text that is fed as input. And we have a second part of the transformer which is called the decoder. And the role of the decoder is to use the meaningful representations from the encoder

along with some internal embeddings that it is computing in order to generate the translation. So that is the context in which the transformer was released, and it performed great. And it is at the foundation of modern-day LLMs, which is the reason why we're focusing on this. So that's the reason why we're here. The reason why I wrote these formulas on the Blackboard

is because I think this is probably the most important formula when it comes to transformers. So just visualizing this in terms of matrix multiplies is very important. So what we will do now is walk through each component of the transformer and see how this all comes together. And I'm looking at you with respect to the position embeddings.

We're going to talk about this now. So for machine translation, what you get as input is a text in a source language. And your task is to translate that source language, that text in the source language into a target language. So your first task is to understand what your source text is about.

So here, you have an input embedding that is tasked with just converting this input text into tokens and then associating each of these tokens with some embedding that you can learn. This embedding is only with respect to each token. It is not context aware in any way. And what you do is you add an embedding that is associated with the position that the token is

in the sequence. And this is where we know where tokens are located. So we add the token embedding and the position embedding together. And so the question you may have is, well, how do you obtain the position embedding? So you have different ways. The ways people-- like the authors have tried

is actually two ways. One way is to learn the embedding. The second way is to actually have something that is a function of just different frequencies. So there are some pros and cons. But I just want to-- so I think the learning way is very natural. But a clear con is if you have an input text that is longer

than what you have learned at training time-- so if you have, let's say 1,000 tokens as input but you already-- you only have learned positions, like embeddings for positions, up to, let's say 500, then you're out of luck. You cannot represent positions greater than that, which is why the arbitrary, predefined representation can be useful. And I just want to illustrate why

choosing different frequencies could be a good way to represent something like the position. So you may have a watch, and you may notice that you represent the time with, let's say an hour thingy, with the minutes, seconds. They all turn at different frequencies. So if you want to read the time, so for 4:49. It's 4, which is the hour piece.

And then you have the minutes, and then you have the seconds. And each of them they turn at different frequencies. And if you put them together, you can exactly know what time it is. So this is the idea behind having a vector of elements that vary with different frequencies. So you can obtain that with cosine and sine functions. And this is what people use here.

So the good thing with these representations is that positions that are close to one another are very similar. And the ones that are far from one another are dissimilar. So this is one nice property. So this is one way of representing the positions. Anyway, maybe I digress too much. We're going to talk more about position next time. But long story short, we can represent tokens along

with their positions. So at this stage, what we did was add the token embedding and the position embedding. And here, we come into the encoder. So the encoder is the component of the transformer which is tasked with computing meaningful representations of the tokens. So here, we have one very important type

of layer called the attention layer. It's actually called a self-attention layer. So a self-attention layer, what does it do? What it does is computes representations of tokens as a function of all other tokens. And this is where this query key value thing happens. So you're going to see that in the example that Shervine will walk you through.

But the idea is to learn projection matrices that will allow you to project your tokens into a space of queries, keys, and values, that will then allow them to interact through the formula that we saw. So that allows you to represent your tokens as a function of others. And then you have another layer called the feedforward neural network, which

is a way for your architecture to project representations into spaces of higher dimension, along with some activation function, which allows you to learn nonlinearities. So you go through the encoder. At the tip of the encoder, what you get is a very meaningful representation per token. That is a function of all other tokens in the sequence. So what you do is now, when you want to translate the text,

so you take your special token that we saw in the very beginning, end of sequence-- sorry, beginning of sequence. So you tell your model, well, now I want to start the generation. So you input begin of sequence as an input to the decoder. You add the position encoding that is associated with that token, which

is the first element in the sequence. And what you do is you enter the decoder, which does two things. The first thing is it also has an self-attention mechanism with respect to the token itself and all the tokens that was generated so far. So it tries to express each token as a function of itself and all the tokens that were generated so far. So in the beginning of sequence case,

it's the only token that was generated so far. So that's it. And then you have a second attention layer, which is a different kind, where you're actually letting the representations from tokens that were generated so far and let them interact with tokens from the source, from your input source, from the source language. So I'm not sure if you can see in the illustration,

you have one arrow which is from what was generated so far. And then you have two arrows coming from the encoder. So the one arrow from the generator so far is the query. And the key and the value are coming from the encoder because you're asking yourself, how can I express this token as a function of all the tokens in the input text? By the way, does that make sense?

Yeah. OK, great. And then you do that. And then you have another layer that's called the feedforward neural network that again, allows your model to learn ways to project your data. And then at the end, you get a very meaningful representation of the word that the token that you passed as inputs.

So here, in this case, in the very beginning, you have beginning of sequence. And at the end of the decoder, you have a very meaningful representation of that token. So what you do is you then project that representation on the space of vocabularies. And you get probabilities that correspond to what you think is the next token.

And so here, translation is just figuring out what the next token is. So you figure out what the next token is. And then you choose what that next token is based on the probabilities. And then you repeat that in an autoregressive way. So you put that new decoded token as input of the decoder. And you repeat exactly what I mentioned.

So we have five minutes. I have some tricks to tell you, but I want to make sure we're all on the same page. So I'm just going to open the floor in case there is any questions so far. We've seen a lot of things, by the way. And this first lecture is probably one of the most difficult in terms of number of concepts

we see, so completely normal if you feel like we've seen a lot. Any questions on this? Yep. So the question is-- there are multiple arrows merging into one. So it's because we have not seen it so far. So this is a trick that actually we can see now. So you may be referring to this one, the residual connections.

So this is actually a trick to help your model learn better. So these residual connections, they're very useful in architectures that are deep because they allow your model to pass in features directly instead of having them be modified by some sublayer. So one way I like to think about this is instead of thinking about each layer as something that modifies the whole input--

so instead of saying my layer is just changing the input-- so let's assume your input is-- let's assume your input is x. Instead of saying that the output of a layer is some function of x, what you're saying is the output of your layer is some function of x plus x. And the way I like to think about it is it's as if you were taking x and modifying it, as opposed

to changing completely x. So in practice, doing that helps with back propagation and allows your model to learn better. So this is what this arrow is about. Yeah. So speaking of the tricks, I have some other tricks to tell you. So one other is the fact of normalizing the activations

with what we call layer normalization. So it also helps with convergence. You may have seen the word "masked" self-attention in the decoder. And the reason why it's masked is because you want your decoder tokens to only interact with tokens you have decoded so far, because you cannot interact with tokens you have not decoded yet. Multi-head attention-- so what I described with QKV, well,

you can do it with in different ways. You can learn different projections. So for those of us who also are familiar with Vision-related models, who knows-- who has a Vision background here? 1, 2, OK. So in case you know-- when it comes to convolutional neural networks,

when you do the convolution operation, you can use several filters, which are different ways of convoluting on your inputs. So having different attention heads is also a way for your model to learn-- to have different ways to learn the same thing through different projection matrices. And so you typically have h such heads.

So another trick, dropout-- who has heard of dropout? OK, great. Yeah, this is an idea that is not just applied in the transformer but widely used. So that one is a technique for which at training time, you intentionally drop some units with some probability in order for you to have your model to not rely too much on some features.

And that allows your model to generalize better. And then what do I have? Yeah, label smoothing is another technique that was used here. So the idea behind label smoothing is when you tell your model to predict the next words. Instead of saying-- let's say what a nice day. Instead of saying, OK, I want you to predict the word "day" 100%, your model is saying you can predict the word "day--"

actually, not 100%. You can have also other words, because in language, you can complete things in different ways and still be valid. So you can say, what a nice day, what a nice class, what a nice evening. Anyways, so label smoothing takes these labels, and it softens it by saying, OK, so instead of your model needing

to predict that label, as in you need to predict that model 100%, you say, OK, actually, the label that I wanted to predict is maybe, I don't know, 90%. And then the remaining 10% is all the other words, in the vocabulary. So it just allows your model to generalize a bit better. And authors have found that this also improves metrics when it comes to machine translation.

So for those of you who know BLEU is one such metric. And with that, I'll give it to Shervine. Thank you, Afshine. So in this last part, our goal is going to piece all that Afshine talked about together in one single example and see exactly how this computation works in a precise example. So as Afshine mentioned, the original transformer

is in the business of machine translation. So what we're going to take is a sentence in English, and we're going to try to translate it into some other language. So in the example of the original transformer paper, they took French and German. So let's take that. And let's start with our favorite toy example,

so "A cute Teddy bear is reading." And as you recall, the first step in all of this is tokenization. And Afshine mentioned that it's a way to arbitrarily split these words into atomic entities. So Afshine mentioned subword is an optimal way to do it. But for the sake of this example, I'm going to take another split just

to prove that it's arbitrary. So let's say we split it like this. As Afshine mentioned, we have also special tokens. So beginning of sentence and end of sequence that you put to characterize where your sequence starts and ends. Now let's look at how we encode them. So we have, in this architecture, a lookup table that is made of learnable weights.

So this is what we call embeddings. And these will be learned as part of the learning process. And as someone mentioned it here, if you want to perform attention in a way that's context aware and that you know where other tokens are positioned, you need that position information. And the original transformer paper puts this position information at the beginning of the input.

So you add it additively. So let's say you call your embedding of size D model. Then your position embedding that Afshine described by a series of sines and cosines of different frequencies will be a vector of the same length and its additive operation. So at this stage, you end up with an embedding that's at least half learnable.

So the lookup table that I mentioned to you is at least learnable. Maybe the positions as well depends on your design choice. And this is what you will put as an input to your encoder. So what happens next? Every token has this representation, and you can represent it in a nice matrix form. Let's go with it.

And you're going to go into the encoder. And as we have seen, the first component of the encoder is going to be that self-attention layer. So you project these inputs into the space of queries. So for that, you have this Wq projection matrix. You get queries. With the same initial embeddings, you projected on keys.

So you have a Wk projection matrix that you will learn to project it into keys K. And you do the same with values V. OK, great. And then based on that, you apply the formula that we mentioned that is so important, that softmax formula. And we do this matrix products. And then we obtain another matrix that is of same dimension as the matrix V.

So before we dive deeper into more specifics, I just want for us to get on the same page on dimensions, because we talked about a lot of embeddings here. We project things. And I just want to make sure that we speak the same language as to what size are these objects. So your input sequence-- so we mentioned it's of length n. And one notation that people use to characterize these embedding

size is D model. And then what the projection matrices of Q, K and V do is respectively, you start from the D model world, and you turn it into the query world, and then key worlds, and then value world. So this is why it's of size D model and DQ. And similarly, D model Dk, D model DV for each projection matrix.

And you obtain these queries, keys, and values that are of size n rows but that are this time, into these query, key, and value space. So the number of columns is DQ, DK, and DV. And since you do, this matrix multiply, you need these constraints that DQ is equal to DK. So here, I put DQ and DK just for the sake of properly naming things.

But DQ should be equal to DK by construction. And this is what you get. All good so far? OK, great. So now, let's pause a second and then go back to this example and see how the matrix-matrix computation work. So as Afshine was mentioning earlier, each token can be represented as a row embedding.

And you have that for Q. If you consider K transpose, each column is going to be the embedding of a given vector. So when you do the matrix multiply, you're going to end up with a matrix of size n by n, where each cell is going to be some similarity. Like here, it's a dot product between a given query and a given key. And let's suppose here, you multiply this

by V. What you're going to end up with is for each row, you have a given query. You project it on the space of keys that you have in your sentence. So you get some-- so you want to get some probability distribution over keys. And then you're going to use these weights to weight the values.

And then you're going to do a sum of all of this. Now you're going to say, OK, Shervine and Afshine, you talk about QK transpose V, QK transpose V. This is not what the formula is. And then you are right. The formula is approximately this. We take the softmax in order to get a probability distribution that sums to 1

and has nice properties. And one thing we haven't mentioned, but that the authors chose, is that you will normalize by some factor because the dimension decay will influence the variance that you might get as part of the sum. So if you want everything to be properly normalized, you can divide by the standard deviation. And this is what happens here.

And so, as we mentioned, this is a multi-headed process. So you do not do this process once you do it h times. So this process of learning queries, keys, and values is done in parallel. And then at the end, you concatenate all these softmax of QK transpose over square root of DK times V, together. And then you have a last projection matrix

that we call W0 that will turn these embeddings in a space HDV back into D model. So you have this nice property, by the way, in the transformer, where a lot of the operations make the original dimension of embeddings invariant. So you start with D model, you do a bunch of attention calculations. You end up with D model.

And then you go into the next layer, which is a feedforward neural network. That is a one hidden layer network that projects this D model representation into a DFF1. And then typically, you would have this dimension that is bigger than the model in order to allow for learning complex representations. And you do all of that big N time.

So in the original transformer paper, big N is equal to 6. So you do that a bunch of times. And then at the end of the encoder, you have for each token, a representation that represents that token in a context aware and learned way. Is everything good so far? OK, awesome. So I'm asking because we're going to switch to the decoder.

So I just want to make sure all make sense. So now that we have that, as we mentioned, the original transformer is in the business of machine translation. So you need to start the beginning of your translated sentence. And one way to force the start of it is to have this is placeholder token.

So you add this BOS token. Look at the lookup table of your embeddings. You have an initial embedding. You add your position embedding to it, and then you pass it to the decoder. And you have this self-attention layer that Afshine mentioned is a masked self-attention layer, because what happens here is that it's causal.

Every token looks at itself and the tokens that precede it. And once that happens, you have another attention layer that's called cross-attention, where the query is the decoder token. And then the keys and the values are the tokens that come from the encoder. So you look at the stack of encoders. You look at the output embedding.

And in every layer of decoder, every decoder block will get that last embedding as keys and values. So you do that, and then you have, just like in the encoder, a layer of feedforward neural network that allows for complex feature learning. And all of that goes. And then you have some linear layer and then

a softmax layer that will turn these representations into a probability distribution over the space of your words-- or your tokens over the vocabulary space to predict the next word. And then what happens here is that-- we will see in the next lectures what could be heuristics to pick the next word. But let's say here, we pick the max.

So you pick the max. You know what word we have predicted. And then you put it back as an input to the decoder. And you do the exact same process again. So here, we put beginning of sequence. You get "un." And then you get the next token [FRENCH] which is the equivalent of "Teddy bear," and so on.

And then you get, at the end, your sequence in the target language. And then you do that until you hit an end of sequence token. This is where you know that you should stop the translation process. So this is how we start from a sentence in a given language, and we end up in one in the target language. So any questions on this so far?

Yep. The comment here is it all looks complicated. If you were to boil down exactly what makes it work, what would it be? So "Attention is All You Need," the title of the paper, translates a bit the secret sauce. So the attention layer here is key. We're going to see in the next lectures that actually,

a lot of these things are dropped. And we rely on a subset of these components that we repeat again and again. So this attention layer is the key. And then the second thing is this feedforward neural network where most of the parameters of the network reside. So if you were to calculate exactly the parameters of your model, you realize that these

contain most of the capacity. And this is where the learning happens. So if you were to ask me, these two, and then the rest are just tricks to better learn to improve all of it, and then, of course, the quality of the data, which is another layer of complexity. Yeah. So the question is, can you talk more about the masked part?

So it's a computational trick where you have a triangular matrix that will mask some connections of your self-attention layer. And at training time, it prevents connections that you shouldn't know to be made. So yeah, that's the gist of it. Yeah, exactly. So yeah, the question is how it relates to softmax?

So you have minus infinities. And then this will be 0. Softmax of minus infinity will be 0. This is how it relates. Yeah. But these are more computational tricks. I think the main thing to have in mind is to forget about all connections from a given

token and all the ones that succeeded. I think that's good enough as a mental model. Yeah. OK, awesome. Yeah. The question here is on various uses of softmax. So the ones that are used in the self-attention layers and the cross-attention layers have a different function

than the one at the last layer. You should see the ones in the attention layer as a projection of the query over the space of keys. So what we do is projecting the representation of a given token, so cross tokens, whereas the last softmax layer has a different function. It's one that tries for you to predict the next token. So in some sense, yeah, so I do get the--

I think it's a great point that we're using several times, this function, but it's for different things. I think there was-- yeah. So the question is, why is the translation not having beginning of sequence? It does. Yeah, it's the first token here.

Oh, yeah. So the first token here is a placeholder for you to predict the next token that comes after it. So it doesn't come at the output of the decoder. It's just the input of the decoder. And then what you get as the output of the decoder that you should watch out is end of sequence because this is where you should stop.

Yeah. OK, awesome. And then with all that, I want to tell you that what we presented today is just the beginning. We're just in 2017 at this point. And there has been, as I'm sure you know, many uses of this technology that now powers all these chatbots that we use.

So we're going to cover how we train such models in the next few lectures. And then in the second part of the class, we will tackle how these can power the agents that we interact and use today and how it can be used in several systems. And with that, thank you for your attention. And I hope you have a great weekend.

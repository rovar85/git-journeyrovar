# Q86qzJ1K1Ss

Source: https://www.youtube.com/watch?v=Q86qzJ1K1Ss

Hello everyone and uh welcome to lecture 9 of CM295. So as you know uh today is a kind of a special day because uh we're having the last lecture of the entire course. Um so the menu for today will be a little different compared to usual. uh we're going to try to divide the

lecture in three parts. So in the first part we're going to recap actually what we did in the entire class just to see how different pieces kind of fit together. Uh in the second part we will look at some topics that are particularly trending uh in 2025 and what we think are going to be trending

in the near future. And then uh the third part will be more uh way for us to just conclude and uh next steps uh for all of you. Does that sound good? Cool. So with that uh we're going to start with the first part which uh what I mentioned is about recapping what we

did this entire quarter. So nothing new here. It's just a way for us to piece everything together. So if you remember u lot of weeks ago I believe it's like maybe 10 weeks ago we had lecture one which was focused on understanding what transformers were. So at the very beginning of the class we

didn't even know how we could process text. So I guess the first step that we saw was this tokenization step which consists of dividing the input into atomic units. And so here the way you we divide the text is something that is arbitrary in some sense. So we have different algorithms that allow us to do

that. Uh and we saw that the most common tokenization algorithm is the subword level tokenizer. And we saw that some of the advantages were that um roots of words could be reused um and leveraged especially when it came to representing those tokens. And

speaking of representation, once we were able to divide the input text into atomic units, aka tokens, the next step for us was to learn how to represent these embeddings. So if you remember, we saw some methods that were very popular back then. So one of them was called wordtovec

and the representation was learned from a proxy task which was something like predicting the center word or predicting the context words. But then we saw that this way of learning representations had some limitations. One of which was that these

representations were not contextaware. Meaning that uh if a word is in a given sentence or in another sentence they will both have the same like that word will have the same representation in both sentences. And so for that reason we saw some uh other methods that were popular in the

2010s. one of which was RNN's if you remember. So RNN's um had this recurrent structure which process tokens one at a time and kept an internal representation of the sequence so far. But then we saw that a big limitation of this was this problem of long range

dependency and in particular the fact that uh tokens that were encoded far in the past were not um quantities that were able to be kept I guess as the sequence got longer and this is the reason why we saw the central idea of this whole class which is the idea of self attention where

tokens s can actually attend to one another regardless of where they are placed in the sequence. So you can think of this as a direct link. And so uh this for instance is what we saw. We we saw that there are like three main uh terminologies that people use.

So query, key and value. So typically you want to know how similar a query is compared to the keys in the in the sequence and you quantify that by um taking some dot products that's kind of scaled and softmaxed and then you have the corresponding value that is taken. So at the end of

the day we obtain some kind of weighted average of all the tokens that are in the sequence. And then uh you may also be familiar now with this formula. So soft max of q krpose over square root of dk um time v. So this is the matrix formulation of what I mentioned here which uh is able

to process these computations in a very efficient way and it's something that uh today's hardware is well equipped to do and then we finish the first lecture by going through the architecture that is the foundation of modern day LLMs which is the transformer and we saw that there are two u not notable parts in the

transformer. So one was the encoder in the left part of the uh um the figure and then the right part is the decoder and we saw how this was applied in the case of translation. So at the end of the first lecture we saw what motivated us to end up with the transformer

and we saw that transformer was working quite well in the case of uh translation and so in the next lecture what we saw was what were the little improvements that people have made to this architecture since it was released and if you remember it was in 2017 that it was publicublished.

So one particular improvement that people have made is in the way we consider positions because in the original transformer paper positions were encoded in an absolute way as in each position had its own embedding and this embedding was added to the

token embedding. But then if we think about it positions actually we don't really care about the absolute position. We care about the relative position between tokens and in particular we care about how far tokens are in the self attention

computation. Which is why we saw this methods that is now quite popular called rotary position embeddings aka rope that is now quite used. And it is a method that rotates query and keys both of which happen in the self

attention computation. And so here um what is uh quantified here is purely a function of the relative distance between um two tokens and not only that it is something that is uh taken care of in the self attention layer which is what we care about.

So this was one big improvement and then we saw some other improvements especially when it came to how the multi head attention um layer multi head attention layer was composed of and in particular we saw that it was possible for us to have some groupings of the matrices that we learn. So we

don't need to have one matrix one projection matrix per head for let's say keys and values. We can actually uh group them. So this is uh for instance what is mentioned here. So group query attention. Um and then we also saw some other techniques that I have not represented here like for instance the

normalization layer in the transformer which here happens after each sub layer but I guess nowadays people have tried moving the normalization piece before the sub layer. So here it's the postnorm version and then the before the sub layer part is called the prenorm

version. And then the last thing that we saw was that from this transformer architecture there were a lot of derived models that were based from that. So we saw that if we only keep the encoder part we could compute very meaningful embeddings. If you remember there was this um uh

kind of landmark paper on encoder only model which is birds which was heavily used in the context of classification because it relied on the encoded embedding of the CLS token. And so that was one. But then we also saw that there was a number of other kinds of models all more

or less derived from the transformer. So you could only keep the encoder which was for birds. You could only keep the decoder which is for instance for GPT and you could also have both which is for instance the case of T5. And one particular aspect of each of these models is that encoder only is not

able in the way that we saw is not able to generate text but is able to generate embeddings which can be used for downstream tasks. But then encoder decoder models like T5 or decoder only models like GPT they can be auto reggressive and generate text. The paradigm can be text

in text out. And with that we then focused on what now everyone calls large language models which are transformerbased models specifically texttoext models. So decoder only transformer-based models and we saw that people have come up with a lot of new tricks now because um you

know these models as the name uh indicates um people have scaled them up. But then one question was uh kind of kind of thrown which is do you actually need all these parameters to just do a forward pass. So we saw uh one kind of uh variant which was based on mixture of experts.

So what mixture of experts are is instead of running everything through the whole entire model, you're going to instead have a number of experts that you're going to activate in a sparse way. So for instance, for one input, you're going to just activate just a subset and

then for another input you're going to activate another subset so that you don't need to do all the computations all the time. And we saw that these mixture of experts they were used in LLMs in particular in the feed for neural network layer. So here you would have experts as being

different feed for neural networks and you would have a gating mechanism that would reroute to the correct feed for neural network. And then we also saw that some papers were also able to kind of produce some nice visualization in terms of uh I guess which token gets routed to which

experts because this rerouting we saw that it was done at the token level. And so one reason why it's done at the token level is to be able to I guess smartly put the experts on different pieces of hardware, different GPUs and then kind of parallelize the computation a little bit more.

And then we also saw that these LLMs they always are tasked with predicting the next token. And in order to predict the next token, we were interested in uh I guess how we were uh you know doing this. And so one particular uh method that people use is just sample sample from the output distribution. So

you have let's say given an input you have a distribution of probabilities of what the next token would be that is output by the model. And what you do is instead of let's say taking the highest probability which is called the greedy decoding uh greedy kind of decoding you actually

sample. So it introduces some randomness and allows the model to produce kind of a bigger variety of uh kinds of outputs. And we saw uh that you could adjust how how much I guess variety you want in your output by tweaking a hyperparameter called temperature.

So very low temperature leads to very spiky distribution. So more deterministic outputs and higher temperatures are I guess a bit more uh random a bit more creative. Okay. So until then we saw what LLMs were, how they were based on the transformer, how they connected to the

architecture that we saw in the first lecture and then in lecture lecture four we saw how people actually trained those LLMs because as I mentioned these LLMs are large and so you cannot kind of naively fit them in your hardware. you need to be a little bit smart about it.

So in particular, what people have uh kind of noticed in the early 2020s is that the bigger your model is, the better your performance. So people just started building bigger and bigger models. So here in the uh illustration we saw that so on the y- axis is the test loss. So the lower the

better. So we saw that the more compute you use the better your tests uh performance and same with uh increasing the data set size and same with increasing the number of parameters but then as you know compute is not infinite. So there was a natural question that came out of the community

which was okay if we give you a given budget a given compute budget can you choose I guess some quote unquote optimal number of parameters and data set size on which you want to train your model. And so we saw that there was this paper that was um published in the early 2020s

uh which actually studied the relationship between um I guess if you vary the data set size and uh the size of your model and the performance on the test set. And then we saw that actually most models at the time were what we say undertrained because they were too big

compared to the data set that they were trained on. Like the data set that they were trained on it was not as big as they should have been. And so in particular there was a kind of a rule of thumb that came out of this which was if you have a given number of parameters in your model

you should at least train it on 20 times the number of parameters in terms of tokens. So for instance, if you have uh a 100 billion parameter model, you should train it on at least two trillion tokens because two trillion is 100 billion * 20. So that's kind of the rule

of thumb that people have uh used and then you know as I mentioned previously you know these models are huge. So people have tried to also make the computation more efficient and so there was this uh method that we saw which is actually quite important called flash attention

and flash attention is a method that leverages the strength the strength of the underlying hardware and in particular it looks at so GPUs more particularly it looks at the kinds of memory memories that a GPU has. So it has a big but slow memory and a small but fast memory. So the HPM and

the SRAMM respectively. And we saw that this method tries to minimize the number of reads and writes to the big and slow memory to the HPM. And so the the way it was doing this was to divide the computation in uh little bits that it would send to uh the SRAMM which is the small but fast memory so

that it can do the end to end computation and then send it back to where it was in order to do the full end toend computation. So that method is an exact method meaning that we're not doing any approximations to the results

but it led to significant speedups and in particular there was this second idea from uh the paper which is a kind of an important one as well which was that sometimes it's okay for you to not store results. it's okay for you to just throw them out and then recomputee when you need them

again. So there is this idea of recomputation using what I described which led to faster run times even though we were doing more computations. So that was flash flash attention and uh we also saw a number of other methods that were meant to I guess parallelize

the computation. So we saw uh data parallelism which was this idea of not having all your data be processed on a single GPU but instead divided into uh kind of multiple places. And then we had the second method which was model parallelism

where even for a given forward pass you would actually involve multiple GPUs. So anyway, there were a lot of very interesting techniques, a lot of different uh ideas about how to train this model in an efficient way. And uh in particular um so what I described here is mostly important for

the first step of uh the training process of an LLM which is called the pre-training which is meant to teach the model about the structure of language about the structure of codes. Uh and in particular this model was trained with huge amounts of data. So think about trillions of

tokens or even tens of trillions of tokens. Um and so that first step goes from an initialized model to a model that is able to autocomplete because it is trained with an objective of predicting the next token. So at the end of this first stage, you

have a model that knows how to autocomplete, but you have a model that is not very helpful because it only knows how to complete things. So in order to have the model be useful for our use cases, we had this second step which is called the fine-tuning step. uh where we teach the model on the

kinds of input output pairs that we want it to perform well. So this is also called uh the SFT stage supervised fine-tuning stage. And at the end of this second step, we have a model that not only knows the structure of text and codes, but also is able to behave in the way you want.

But so far up until step number two, we have only taught our model what to do. We have not taught it what to not do. And this is why we had our third step which was the preference tuning step where we took our model that went through the pre-training stage that went to the SFT stage and now we want to

inject some negative signal as well as in I want you to prefer this compared to this output. And this third step uses preference data. So like the name uh suggests so preference tuning uses preference data which is typically pair-wise data where humans say okay I prefer this output

compared to that output. And typically the model here is able to align the kind of output it produces with human preferences that could be along the dimension of uh usefulness of safety, friendliness, tone. Um there's a bunch of different dimensions but uh yeah so that's what is happening in this

third step. And in this third step, it's actually in lecture five that we dug into what that third step was about. So if you remember uh we had drawn a parallel between the way our LLM produces tokens and I guess what people in the reinforcement learning field um I guess

consider how uh given policy is uh interacting with some environment and performing some action and being in some states. uh and the reason why we drew drew that parallel was to be able to leverage some RLbased techniques in order to train our model. So in this case we said our LLM is a little bit

like a policy. So given some state which is the input it has received so far it can perform the next action and in this case it is to predict the next token and this prediction is made in the environment of tokens and when we u like predict a completion

what we do is at the end of the day we have some signal some reward part which can be the human preference. So this is the parallel we drew with the RL worlds and with that in mind we talked about rewards but the problem is that rewards are only available for a limited set of data

which is why we saw how to model rewards. So we saw this formula if you remember it's called the Bradley Terry formulation which um models how the probability of an output being better than another one is as a function

of I guess two scores like the score of output I and the score of output J. And we saw that reward models they are typically trained by having this formulation in mind in a pair-wise fashion. So what this means is a reward model you give it two outputs. You say this one is

good, this one is bad and then I want you to say this one is good. You train it in a pair wise fashion. But then your model is actually predicting always two scores. It's always predicting the score RA I for output I RJ for output J. Um and so at inference time you're only giving it one output.

So I think that's like one subtlety like we train it in a pair wise way but at inference time we're kind of using it in a in an individual way if that makes sense. And so once we trained our reward model using this formulation then we were able to use it to steer our

LLM towards the direction that we care about. So if you remember the way we steer our LLM in the direction of human preferences is to give it a prompt so that it can produce a completion aka a rollout or in simpler terms an an answer.

And then we take this prompt, we take this answer, we put them both in the reward model that tells us how good the model response is. And depending on what the reward model says, we can tune the weights of the LLM in a way that maximizes human or the reward that we saw which is trained on

human preferences. And the loss function of this RL uh setup is typically something that tries to maximize rewards but also keep the model close to the base model. And here by base model we mean the SFT model. And the reason why

we want that is because this reward is imperfect. So we saw this uh phenomenon of reward hacking where your reward can be imperfect and the LLM can exploit its imperfect nature to tune it in a way that actually does not align with what you want it to be.

So you want the LLM to not be too far from the base model which is actually already a good model. So it's a way to regularize that if you want and you also want the iteration updates to not be too big either. So you typically have these two

constraints. You don't want it to deviate too much from the base model, but you don't want it to deviate too much from the previous RL iteration. And then just as a reminder, I think this was lecture five. I think was the most technically challenging of the whole class. So completely fine if the

first time you were like you know what's happening. Uh but hopefully now it should be a little bit more more clear. Uh cool. And then after lecture five we're like okay we've done a lot of uh hard work. So uh the good thing is you know we're in 2025 and in the past 12 months or now 14 months we've seen a lot

of models that were being released with these reasoning capabilities and the way they were trained to exhibit these advanced reasoning capabilities was actually leveraging a lot of the techniques that we saw in lecture 5 just like oral based techniques. And in particular, what we want our LLM

to do is to output a reasoning chain before producing the final answer. And the reason why we wanted to do that is because people have seen that it improves the performance of the model. And so it's actually relying on this idea of chain of thoughts, which I believe we saw at lecture three.

which is a prompting technique to have your model output the reasoning before outputting the the response. So long story short, up until lecture six, our LLM was having a prompt as input directly outputting the output. But in lecture seven, we said, sorry, in lecture six, we said, uh, well, let's

have our LLM actually first output a reasoning chain that the user may or may not have access to before outputting the final answer. So you want to teach the LM to do that. So how do you do that? Well, first before doing this, I just want to show you this chart which we saw which is the

performance of uh the model as we're teaching it to produce these reasoning chains. So people have typically measured uh the improvement in performance by comparing it to uh I guess certain benchmarks and this one is a popular one the AIM benchmark which is the math math benchmark and we saw that

as the training progresses the accuracy number of uh I guess what the LLM outputs is increasing. But back to what I was I was saying uh the key technique that we use to teach the model how to output these reasoning chains is leveraging the RL techniques that we saw

in lecture five. And in particular um up until now we saw PO which was the main RL algorithm that people were using up to maybe last year and now people are kind of prioritizing GRPO as an R algorithm in order to teach the model to be better at reasoning tasks. And there are several reasons to do to

to that that I will explicit right now. So we saw this illustration that compared how GRPO was differing with PO and if you can see in the graph uh there are a few things that are different. The first thing is that GRPO does not rely on a value model. So, who remembers what a value model is?

Yep. Yes. Exactly. So, the value function is trying to predict what the reward would be if you um were to follow the policy of the LLM. Um, and I guess it's a way to have some baseline as to how good some predictions are. You want to make it more relative. So the value function

is a way for us to make these uh rewards a little bit more relative to one another. Um, and so that's what that's how PPU was doing this. So it was having a value model that was um making these predictions and then we had uh this generalized advantage estimation method that was combining the reward

predictions with the value function predictions in order to have what we call advantages. So advantages is how good your output is compared to some baseline. But then in contrast to that, GRPL said, "Okay, tree, we don't need a value function because it's, you know, too

expensive to to train, to maintain. What we're going to do instead is generate several completions and then have some formula that compares the rewards of these completion these completions to one another. So it's going to have some relative

effect in a sense that it will make things more relative and in doing so you are actually not uh needed to maintain and train a value function and that's like one big difference compared to PO. Um and uh the second big difference which is not represented in this

illustration uh is that uh GRPO is typically an algorithm that people have used in the context of teaching your model to be better at reasoning tasks. And so we saw that these kinds of problems have a verifiable reward

because when you complete a math problem, you actually know the answer you need to get to. So you don't need to train a reward model to tell you how good your final answer is because you you already know the answer. And so we saw that GRPO was in

particular used in the context of when you actually don't even need a reward model when you actually have a verifiable reward. So at the end of the day, the only two models you need to keep are the policy model and the reference model to be able to just compare how far you are from the

reference model. Cool. Um, I know this one was also a challenging class, I guess. So far so good. And this is also on on the final. So, which is why I'm I'm taking things more slowly for this second part of the recap. So, is everything good so far? Yeah.

Okay. Perfect. We also saw some extensions of GRPO. So if you remember there was um some kind of bias that was um a result of the loss function of GRPO having some normalization term that penalized tokens that were in shorter outputs. So we saw that if you use GRPO in its

original case in its original form we saw that after a certain point the algorithm will incentivize your model to produce longer and longer answers longer and longer incorrect answers. And the reason why it does that is because relative to short incorrect

answers, it penalizes less long incorrect answers. And so this is the reason why there are some extensions that people have worked on this year. One of which was uh GRPO done rights. So we saw like um that they basically removed the normalization term and there

was another method that we saw it was called depo dapo which also had some variance and that's for reasoning models and then lecture seven we had a model that you know we knew how to train it we knew how to uh use it for uh reasoning tasks how to train it to be better but now we

wanted the model to be useful and interacting with outside systems. So we saw one technique that is kind of an an essential technique called rag short for retrieval augmented generation that is meant for you to be able to fetch relevant documents from some knowledge base in order to answer

a question or answer a prompt. And the reason why you want to do that is that the knowledge of your LLM is including up to the data that is up to the knowledge cut updates which is the max dates of what your LM has been trained on. And from a practical standpoint,

I guess from what we see nowadays, you're typically not training your LLM daily or continuously. And so in cases where you need your LLM to know about things that happened recently or about things that happened that were not in your LM training data, you want your LLM to have access to such

information. And so that's how rag is very useful. So we saw that rag dependent very heavily on the way it retrieves data. So we saw that the retrieval part was mainly composed of two steps. So the first one was candidate retrieval which use which uses a by encoder kind

of setup where you're basically doing some semantic search. So you're computing the embedding of the query. you have some precomputed embeddings of the documents in your knowledge base and you're taking the ones that maximize some similarity score like let's say some cosign similarity.

So the this first step is allowing you to retrieve um I guess a filtered version of the potential documents and then typically you have a second step which is called ranking or reranking because the first step already gives you a ranking which has typically a more sophisticated

setup. So it's a cross encoder kind of setup where you have your query and your document that are both fed to some model and produces a more precise score and then you use this final score to rank the final results and you typically choose the top let's say K

and then you add them to your prompt. So it's the augmented part. So retrieval is everything I mentioned so far and then once you have the relevant documents you add them in your prompt which is the augmented part and you generate the answer. So the reason why I'm taking so much

time on rag is rag is such an important concept also if you were to you know have interviews or you know also maybe in the exam who knows um so I think it's a it's an important concept to uh to have in mind the second one that we saw was tool calling

and tool calling is allowing your LLM to leverage tools. The way it does that is in two steps. The first step is for your model to know which API there is out there. At the end of which your LLM says, okay, I want to use this API and I want to use it with these arguments.

And then you have an intermediary step which is you just run your API with these arguments. And then the second step is you feed the results of this operation back to the LLM which then produces a final answer. So that's how tool calling works. So if you say to your LM okay you can use this

use this API this is how your LM would leverage that. And then we saw that modern-day agentic workflows were leveraging both rag and tool calling as key methods to um perform actions. And we saw an example detail example uh which was such that you had some inputs

and then your LLM had a series of different calls um in order to perform some action and then at the end of it it retrieves sorry it returns an answer. Cool. And then last lecture we saw how we could evaluate LLMs which is a much tougher thing to do now that

LLMs can do a bunch of different things. So we first saw that there were some rulebased metrics that people were using before LMS came into play. metrics that you may have heard like blur, rouge, meor and so on, but the main limitation was that they were not considering how language could differ but still be

correct. And so uh this key idea that we saw was why not leverage LLMs to evaluate outputs. And so there is this uh key idea of LLM as a judge where you receive as input the prompts the model response along with the criteria that you want the response to

be evaluated on. And then you want your LM messages to output two things. The first one is a rationale for why a given score is output. along with that score. So nowadays, LM as a judges, they're typically outputting a binary response

either uh pass or fail, true or false, just because it's easier. And we're also having the rational be output before the score because in practice it's something that also improves the performance of uh the element as a judge a little bit if you

want like reasoning models do by outputting the reasoning chain before they output the answer. But then we also saw that there were uh some biases that came with this approach. We saw position bias which is the way you present the elements to compare matters. So if you present

something first then maybe the LLM will just prioritize that first. Uh so there was position bias, there was verbosity bias which is your LLM just preferring longer outputs. Uh and self-enhancement bias was another one where it prefers its own outputs. Um and then we also saw a number of

benchmarks uh that people use nowadays in order to say how great their LLM is. So if you see the releases that come out, there are typically a bunch of metrics across a number of different benchmarks that people know about. So that spans uh knowledge, the ability to reason, coding

which is very important because a lot of applications are coding related and then safety and then this is not an an extensive list so there's actually many more dimensions. Um so yeah I think that's where we stopped

and it was last lecture and this is all you are expected to know for the final. Everything after that is not going to be part of the final. Any questions on this so far? Cool. Okay. I'm expecting a hundreds for

everyone for the final. But yeah, um I would say what I went through is going to be foundational for the final. So I guess if you understood everything I said, I think you're going to be ready for the final. So um yeah, but if you have any questions, you know, Shervin and I are

always here um to uh Oh, yeah. You have a question? Yes. So the question is, is the scope for the final of lecture 5 to lecture 8? Yes. So for midterm it was lectures 1 2 3 4 and this one is 5 6 7 8. So I guess it's u equal equal size. Cool.

Okay, great. So, with that said, we just finished recapping this entire quarter worth of lectures and now we're going to go to the second item of today's menu, which is looking at some trending topics. And so, I'm going to start with the first one.

And I'm going to introduce it as follows. So if you remember we saw that the transformer was a concept and an architecture that was first introduced in the context of machine translation. So it performed great. People said okay

it performs great on machine translation why not try it on other text tasks. So they tried it performs great but now the question is can you not use it for things other than text it's a natural question right so in order to answer that question I just want us to remind ourselves that this

architecture is relying on this concept of self attention and this is what is making the transformer work so Well, so if we just recap what self attention is, this uh illustration kind of does the job quite well. You have a query and then you have a

bunch of other elements which are represented by your keys and your values and you want to know which other elements are actually relevant in order to compute the embedding for that query. So right now we have only used tokens you know text tokens

but text tokens they're actually vectors. So if you take those vectors and you actually represent something else than text like for instance parts of an image. The question is would the transformer based on that kind of input also perform

well. And so here the key question that I want to ask is how can we adapt our transformer to work on non-ext input and for instance here we can think of image understanding input. So you have some image and so it's a traditional um

computer vision task where you want to know in which class this image belongs to. So you want to know if having some transformer-based architecture would work well in that situation. Well, the answer to that is well, first

in order to adapt it to this task, you would take the encoder part of the transformer because in order to understand what is in an image, you need to classify that image in some sense. So if you remember if there's one model in what we saw that was working very

well for classification was BERT because BERT is encoder only. It computes meaningful embeddings that can then be used for projection purposes or for classification purposes. So it's a very natural choice that here we would have. So here we would just keep the encoder part of the transformer

and then have the self attention mechanism come into play and um compute meaningful embeddings that we could then project for our relevant task. And this is exactly what a group of researchers did back in 2020. So have you heard of VIT vision

transformer? Yeah. No. Yeah. So what I described here is exactly what they did. So they took an image, they divided that image into patches. Those patches were represented by some vectors. And of course you have some some kind of

position information that allows you to know where your your patch is in the image. And then you just put it through the transformer encoder. So the encoder part of the transformer and you compute the representation corresponding to the CLS class very

similar to birds and you would just project that representation over some classes of interest and then you would perform your um your uh I guess computation uh like this. So what that paper found was that if you train such a model on a lot of image data on a lot of image data you then

outperform these traditional convolutional neural network kind of methods. And so those kind of uh remarkable because so why is it remarkable? Because in the vision case, so there is this concept of inductive

bias where you want to gear your model towards looking at certain things in order to to deduce the results. So convolutional neural networks are a kind of model that are designed in a way for you to look at the image in some you know sliding way. You know

you look at your image a little bit like you would look at it in practice as a human. And people had hypothesized that such such a bias such an indictive bias would actually make sense for something like a vision task. So you contrast that with the vision

transformer which is actually letting all parts of the image attend to one another which has on the other side very low inductive bias. So what this paper showed was if you give your model enough data then it will actually learn how to classify

um I guess your images in this in this classes. So this was like kind of a remarkable results. Um so I think this is like pretty remarkable and a nice extension of everything we saw. So with that in mind, um I want us to just go through an end

toend example of how you would process an image and go through that um vit so vision transformer in order to make your um prediction. So here you would take uh like your favorite image that you would just split into patches. So here you can think of you predefining some uh fixed size patches.

So here I would say like 3x3 let's say and then each patch has some um fixed number of pixels and then what you do is for each patch you try to have some vector representation. So you can think of each patch as so what is a patch? So it's composed of

pixels. So if each pixel has three values which correspond to red, green and blue, then you can find a way to project those on some lower dimensional flattened space and you can learn how you would project that through some kind of linear layer.

So long story short, you just find a way to associate a vector to each of these patches which you you then represent every single one of your inputs. And then you have of course a special embedding for the CLS token which you

can also learn. And you add the position embedding. So you do the same for all of your inputs and then very similar to birds just put that through your encoder. Let everyone interact with everyone and then at the end of the day what you care about is a representation of the

input that is meaningful. So typically people take the encoded embedding of the CLS token. So the reason why they take that is one because it's a convention but second one is this CLS token. So the encoded embedding is actually an embedding that has interacted with

all other tokens through this self attention mechanism. So it has seen everything and then you would project that CLS token encoded embedding onto some class through a feed for neural network in order to predict your final class. So in this case we know it's a picture

of a teddy bear. So here we would want the model to classify this as a teddy bear. So far so good. Does that make sense? Cool. Uh, so now, okay, we know how to process image input, right? Now, so another question is how would you have your LLM

answer questions about your image, which is something that you can do actually nowadays. Like if you open chat GPT you can input an image and ask it questions. So you would have two kinds of inputs. So you would have an image which we saw we can find a way to represent

and then the text which you now know very well how to represent like with tokens. So the way you would allow the model or let the model process. All of this is typically as follows. So there are like a couple of methods. The first one

is the more most common one which is you just feed everything as input. So the image token as input, the um text tokens as input and you have some representation to have the model just know that these are image tokens and this is like text token and then you let it generate an answer in a decoder only

fashion, auto reggressive fashion exactly like you would do it the first method and a lot of such models are designed that way. So there is for instance a very popular uh open weight I believe um vision language model VLM that's what they are called uh model called lava

and this is how they do it. So they have some encoder on the image parts uh that produces some tokens that are then uh concatenated with text tokens that are input into the LLM. So that's one method. The second method which is less common is to have the images be input at the

cross attention layer. So here what you would do is you have your text input and then your image input. You don't put it in the input. You actually let it interact with the text tokens within the cross attention layer. And this is something that for instance

llama 3 had represented in their paper. This technique is typically less common. The first one is more common. So I guess what I want to say is CME 295 focused on the transformer specifically in the case of texttoext problems. So text generation is all you know this class

but we also have the transformer that was used for non-ext applications. So here we saw image understanding so vision understanding with the vit and then uh we will not have the time to say this now but also for image generation tasks we can also have parts of the transformer be used in that architecture

and so you may uh you know hear about diffusion transformer or multimodel diffusion transformer that's actually rely on the self attention mechanism and um this is actually not an exhaustive list. This is also something that has been used in other uh domains like recommendations, speech and so on.

So I guess I what I want you to remember from this is that transformers were like was an architecture that performed very well for machine translation tasks but then it proved to perform very well for other text related tasks and it was then reused in a bunch of

other domains which also proved to be quite successful. So I would just encourage you after this class to also keep an open mind for non-ext related transformer applications and the ones that I mentioned here are maybe just a few first few pointers into the kind of papers that you can look at.

Cool. So here we said that transformer was something that came from the text world that's also uh useful and used in other worlds. Now I want to tell you about something else that was uh I guess used and useful in the non-ext world that may be useful in the text world

and I want to tell you about diffusionbased LLMs. So who has heard the term diffusion? Who knows about diffusion? Yeah, cool. So we will see how we can apply that to LLM. So this is a very trendy topic. I believe the first paper started

in the early 2020s, but I guess it's only now that people are starting to have this really work. I just want to start with a motivation which is that up until now we have taken for granted the fact that our LLM is an auto reggressive LLM and by auto reggressive what do I mean by that?

So it takes some input and what the LLM tries to do is to predict the next token. So given everything so far, we predict the next token. We do that and then we take that token that we just predicted along with everything that we have predicted so far

and then we again predict the next token. We predict it and we go again and again up until you know finishing the sequence with that end of sequence token which makes the generation stop. So this is a true auto reggressive generation as in we take the input so

far in order to predict the next token and then we repeat this process until the end. So it's something that people now try to kind of give it a name which is like auto reggressive model kind of model. So, ARM, if you kind of see this notation, that's what it means. Um, the

problem with that kind of paradigm is that inference time generation is actually not something you can parallelize because you always need what's before in order to predict the next one. But I just want to say that inference time generation is not paralyzable. But

training is paralyzable. So if you remember the way we do training is we input all the tokens that we want our model to predict and then we let the model generate tokens out of this. So basically in a decoder only setting you have this causal mask which lets your model not cheat if you

want and not use the future ones. So I just want to say that when I say that uh this paradigm is not paralyzable I just want to emphasize on the fact that it's a inference time that I'm saying training time you can actually paralyze that quite well. So as I mentioned that's one of the

reasons why people have tried to look at other paradigms and in particular um so if you know about diffusion you know that it works very well for the vision domain and so people have tried adapting this paradigm for the text generation case

and uh so this is like a bunch of screenshots we took from announcement that happened this year. So for instance uh earlier this year there was an experimental text diffusion model from Google that they presented during the IO event um which was very impressive because it

led to a lot of speedups. And then we have some um like different startups. So Inception is one of them uh that made headlines I believe a couple of weeks ago or last week no sorry a month ago um that also are pursuing this route. Um, so all of that to say that this direction is a very trendy and hot

direction that potentially has a lot of promise. But the key issue with this is that text is discrete whereas images are continuous. And we're going to see why that distinction that I just made matters. So I'm going to try to explain to you

what diffusion is in two minutes. So in the image world in order to generate an image what people typically do is they start from noise and then they try to generate some image.

Now now you may wonder okay why noise? Well, you cannot do something that's um you know uh auto reggressive because I guess like if you were to say okay let's predict the pixels one at a time uh it's just not tractable because there are many pixel in in an image and this is typically not how you produce uh an

image but some other reasons are that uh noise is just something that you can model very well with uh some very popular distributions so gausian distribution if you know about it has very nice properties. Um, also noise is very easy to sample. So, it's very easy to start with that. Um, noise

is also a way for you to introduce randomness because you don't necessarily want to always produce the same image. You want to have uh the uh I guess choice of generating images that are slightly different from one another. And uh just mathematically it works quite well. And um speaking of that, the

goal is to learn some transformation that would allow you to go from noise to the target image distribution. So all of what I said here is just kind of reasons for me to tell you, okay, noise is actually a choice that is quite natural to start with in order to

generate an image. And to give you an analogy, um let's suppose you're a sculpture sculptor. So the person who does sculptures. So if you want to do a sculpture, you typically start with some rock. But then rocks are, you know, different

from one another. They always have uh things that are unique to them. And still you would focus on what to remove in order to obtain the end sculpture. So you can think of the rock as being your noise and your end result as being your target data distribution.

So I just want to have this quote by Michelangelo. So the sculpture is already complete within the marble block before I start my work. It is already there. I just have to chisel away the superus material. The reason why I'm reading that is you can have a a nice analogy between what Michelangelo said

and the process of denoising the noise to get an image. So this is all just motivating how image generation is done. So you start from noise and you want to generate an image. So the way you do that for diffusion is to learn some transformation

that would allow you to go from noise to image. So you have two steps. I mean you have more than two steps but we have these two main steps for diffusion models where you first want to start from clean images and you add noise gradually

until until you obtain some very noisy image and then from that what diffusion models try to do is to predict the noise to remove in order to obtain the image. So, it's a little bit like, you know, you're the sculpture sculpture person

and you have your rock. You just want to learn what pieces of rock you need to remove in order to obtain your final piece of art. So, this is what diffusion is. So it works pretty well because noise as I mentioned is typically something that people draw

from a gausian distribution. Gausian distributions are mathematically very well defined have a lot of nice properties. So that's why they work so well. But now the question is how would you adapt this to the text world? Because in the text world as you know we're talking

about tokens. Tokens are discrete. So there's not this concept of you know adding noise. Cannot have that. So pe what people have tried to um to do was to find a text equivalent that would make sense. And this is what the current research

points to which is that noise is to images what the mask token is to text. So mask is just a way for us to just not have the information coming from one part of the sequence. And I just want to go through the revised two-step process that we saw here for text.

So here for the forward process instead of noising your input you would just have more and more inputs that would be masked. So that's the for process and at the end you would just obtain a sequence full of mass tokens. So what you want to do is to learn

some model that allows you to unmask these mass tokens in a way that reconstructs the original sentence. So there's some math that goes into it. Obviously in a few minutes we will not have time to go into that. But I just want to emphasize on the key idea which

is you want to do diffusion but in a way that makes sense for text inputs. And the way the way it would make sense is to consider the noise for images as being mask tokens for text input.

Cool. And so with that in mind, you have a bunch of models that are being released these days which are called masked diffusion models, MDM. So whenever you see MDM now, you know what kind of model we're talking about. So notations are still very um not very well defined. So it may change in the

future. But one other term you will see out there is also DLLM diffusion based LLM and this is what it's doing. So instead of predicting a token in an auto reggressive fashion like one at a time, what it does is that at inference time it goes from a completely masked

input sequence and it tries to predict what tokens were behind these mass tokens. So of course um you know in a real life setting you would have some prompts here. you would have some prompts. So of course in order to predict this answer you would have some conditioning. So you

would tell your model okay given this prompts you're going to start with all these mass tokens just try to predict what the answer is. So in case you're having trouble with the intuition. So I also had trouble in the beginning you know why would it make sense for text to be solved in a

diffusion manner because typically when you write you write one word at a time. So one helpful way to think about this is let's suppose you want to write a speech. So you would not directly write your speech in a linear way.

You would first have like a rough plan. you say okay I'm going to talk about this in the first place second third you have some kind of draft and then you try to refine what is in each of these sections so you can think of diffusion as kind of working like this so it tries to have a

course to fine refinement of the output so it can predict things that are you know after a certain token that has not been predicted But you can think of this as being something that goes from a very drafty version to a very refined version. So that's what I think about this

process. Hopefully that's helpful. And the key advantage here is that the decoding is now done in much fewer forward passes because previously you had to do as many forward passes as there were tokens to predict. But here for diffusion you only need to

do as many passes as there are steps in your diffusion process. And the number of steps is something you can fix. So the higher the step, the more high quality your output is, but it's typically much lower than the length of your output. So that is the core reason why

this model is so much faster than the auto reggressive one. And um of course you know uh we don't have uh that much time but in case you're curious in case you're interested after the final once you're completely freed in terms of uh things to think of uh just put some references that could

be help helpful. There's a paper that came out earlier this year called LADA large language uh diffusion model with masking. Actually, I don't remember the full acronym, but it is actually going through the math and why the thing that I just mentioned works.

Uh, and then there's like a bunch of other papers that would also be helpful. So, the links are in the at the bottom of the slide in case you're interested. And I just want to go through two last things before giving it to Shervin. So first on the advantages of this new paradigm.

So the first one is the speed. So as we mentioned it's going to be much faster than traditional auto reggressive models especially for outputs that are longer. And so some benchmarks they even say that it's something along the lines of 10x faster. So for cases like coding it can be very

powerful because you may have to do several model calls and uh you know you as a user you're just waiting for that code to happen and you know just having a lower latency makes a lot of difference. The other thing is that the nature of this approach is actually considering

the text as a whole in order to make the predictions. And so there's a category of coding tasks that are called fill in the middle which is about trying to figure out you know you have a bunch of code and you want to know what's missing. in the middle and so fill in the middle

and diffusion models are typically better formulated for the kind these kinds of tasks because they can consider I guess input from multiple directions and um you know that's why this approach can be probably something that can be useful for some applications.

So in terms of the current work, so these models they look great you know what I mentioned to you looks great but the performance was not on par with the current frontier models at least for some time but it's something that may change. So the papers that I mentioned they are

actually posting performance that is kind of catching up with the models that are auto reggressive. So there is some promise in there. And then uh the other line of work is just to adapt all the techniques that people have come up with uh like for instance you know

reasoning chains. How do you adapt that for diffusion? Um like you know and so on. You know there are so many techniques that are intrinsically more better suited for auto reggressive kinds of models that can be adapted for that

and that's what people are working on. So long story short, what we saw was that things we saw in this class could be used in other domains. Like for instance, we saw the vision transformer uh that was borrowing the transformer for vision related tasks. But we also

saw that things from other domains could also be used in the text world. And that's what we saw with diffusion LMS. Um, and so this is probably, you know, of course a subset of everything that's happening. And so with that, I think we're concluding our second item of our menu.

And um, I'm going to just give it to Shervin. Thank you, Ashin. And with that, welcome to the last part of the season finale of CM295. And as Ein mentioned, now is the time for some closing thoughts and see um what we can get away from this class and

uh concepts that are u neighboring to it. Uh so first Afin went through the concept of diffusion and images and we saw some similarities. we could draw with text. And now we're going to see what kinds of inspirations have both modalities taken from each other. And

we're going to see um that actually like a lot of things can be um reused. So the first thing that I want to mention in terms of what has been reused is the architecture part. So Afinen uh mentioned this uh like diffusion concept that was born in the field of images but that was taken for text and was able to

yield uh lower latency like a higher speedups which is great when you're a user. Uh so this was one example of a win. Uh and then on the other direction um traditionally images have been dealing with um convolutions mostly as as uh model architecture type but uh these

papers saw that replacing convolutions with transformers uh was very good even um yielding better results. So all these latest diffusionbased papers in the field of images typically use transformers and then here I'm linking one of the papers that Afin already uh briefly went

through. But not only uh is it the architecture sides that is uh that that is the subject of pollination between these modalities. You could even think of other kinds of components like the input. And for this one I want to mention the example of deepsek OCR. So I

don't know if you've heard of this paper. It just came out very recently and contrary to what the names the name suggests. So, OCR stands for optical rec uh like recognition, character recognition and it's usually a field that tries to convert some scanned image into text but actually that paper

doesn't boast some improvement on the OCR task itself rather it showed that you could learn some function that reconstructs text tokens based on vision tokens and not only on vision tokens on very few vision tokens. So it showed that the representation power of patches of

images as tokens was very strong. And you have some researchers that bring some rationale to it like um you know hey tokenizers are not the best tool anyway. and then things in patches convey the meaning of text already with the example of emojis and so on that you would otherwise need to represent with

way more tokens in text. Um and then another example I want to mention is even when you look inside the architectures some of the tricks uh can be reused and adapted in each field. So here I'm mentioning the example of rope which fin mentioned in the recap that was used in

text to represent uh the relative position of tokens and in the case of images or even multimodel setting where you have the presence of both text and image within the architecture. you're able to adapt that trick uh by reformulating it in 2D. So here uh the figure shows how you can attribute rope

positions in the 2D grids and how you could place text tokens such that the relative computation of position still makes sense. And you know even beyond that I would say that the ongoing research for transformers is very much alive and people are still figuring out all the

details that we're working with today and you see refinements all the time coming uh in terms of new papers. So it's um you know it's something that is still developing and you can look at it from multiple angles. One is each of these design decisions

that we've had they are still being iterated on. So like I'm listing a few items here as an example. So one is the optimizer side. You might be familiar with the atom optimizer and its update role which has been popular for quite some time and it seems that uh state is being challenged with a newer paper. So

I referenced here the Kim K2 paper that came out a few months ago that uh introduces a new kind of optimizer called muon and the latest version of that muon clip seems to be a potential candidate for this optimizer to to become like the new standard. So this field even

like as basic as it can be is still developing but it's not only the optimizer side you also have the topic of normalization where Afin mentioned that the difference between the original transformer paper and what you see today in LLM papers um you don't have the same kind of

normalization anymore in the past you had postnorm but Now you have pre-norm which brings the normalization earlier on in the layer. Uh but beyond that design choice of the loca location of normalization you even have the type of loca uh of

normalization that changes. So the transformer paper used layer norm but these days you might see other kinds of uh normalization techniques like RMS norm which uses less parameters and others. So the theory behind it is not set just yet. Uh so you have other kinds of

parameters. Um Ashin mentioned the grouped query attention paper and you see these days in LLM papers not a fixed design rather every paper adopts their uh their own technique. Sometimes you see one kind of u attention used at a given layer but then it switches and different papers take different design

decisions so it's not set in stone. Um then you also have activation functions. So traditionally in deep learning a lot of emphasis was put on ReLU which is uh very simple and used worked very well. But in the world of LLM the shift was towards uh ReLU like um activation functions but not exactly relu. So you

had gausian error linear uh units you you had like other kinds and the the research there is still ongoing. So you you still see um you still see new activation functions coming in uh now and then and then you have also whether to take the design option of uh considering the LLM as ane or not and uh

even the number of layers of your LLM and other hyperparameters like number of heads um size of the number of units in the FFN all of that is still up for debates uh in terms of like design decisions. So it's not fixed. Uh and then another area of research I

want to mention is the data part which is crucial. So the first LLMs they enjoyed a relatively clean state of things because you could scrape the internet and hope for a lot of data that was for sure human generated. So you could learn these patterns from quote unquote a high

quality source even though it's like not in high quality format when you look at typical internet data but it was still uh generated by human. So these days the state has changed. You type anything you want in your favorite search browser. Chances are the first results are 80% LLM generated. So are we doomed?

Maybe not uh because actually you see the development of more and more work in data curation. So in the past you would just scrape the whole internet and train next token prediction on it. But now you have more and more this work of curating data sets of interest and you have

companies that work on it and you have the emergence of newer fine-tuning modes. So in the past you had pre-training and then fine-tuning. Now you have pre-training, mid training and fine-tuning. And the mid-training part trains still on a large corpus of data but higher quality. So people are

finding ways around it. Um and I would say the picture is not all grim but it's just that we need to do more work in order to be um to have meaningful data at hand. And the paper that is linked and at the bottom of the of the slide is dealing with the phenomenon of what if you were training on LLM generated data

and it's talking about a concept called model collapse and it says that LLM generated text is typically less diverse. So the data distribution that you would see at training time changes and it leads to less meaningful learning at

training time which is why it's typically bad and it motivates the need for more work on the data part. Okay. Nice. Um and then you know even taking a step back on the very architecture we've been um using all along is it the best one? it's not it's not clear. So that itself is an area of

research and um future breakthroughs might come from redesigning this uh this architecture. Okay. So in the past few years a lot of the research that we have seen has been on improving benchmarks even more each time. So you have a set of benchmarks. Everyone tries to get the

best results. So it's a natural trend because you want to have more and more powerful models that fulfill all your use cases. But let's say we reach a point where all the use cases we care about are solved. Then what? So I think we're going to see the

emergence of this second border of the Parto Frontier where we care most about making predictions from LLM cost effective um and still very high quality. So uh we see this emergence of uh smaller and smaller LLMs like I think it has been dubbed small language models

SLM uh like in the literature and um yeah typically you hear sometimes LLM providers say that they lose money even on the highest tier plans. So I think it reflects the fact that you need to be smarter in the compute that you spend for serving LLM queries at test time and uh yeah I think this this will motivate

more and more uh this line of research in the coming years and then there is another area that we've not touched on at all in this class which is the hardware part. So typically the kind of device that you use to train these LLMs are GPUs which are great at one thing matrix multiply.

Uh but the thing is uh we've kept these kinds of architectures to train our models even though the architecture doesn't only need matrix multiplies as a foundational um like atomic unit of compute. the uh self attention world and the transformer

world has all these special needs. Um you know the Q K transpose part we saw was actually very expensive which has motivated papers such as flash attention to as Afin mentioned actually forgo of some of the data for the sake of not doing too much movement on the memory side

even if it meant recomputing the same things afterwards. And then a lot of work has been on optimizing where the flow of memory within the GPU resided. And this shows that maybe you need a more um optimized uh hardware architecture in order to uh to to um to solve these use cases. So there is a

recent paper that came out um that actually encodes all of these operations as part of the hardware. So in the past the core um the core operation that the GPU was great at is matrix multiply and based on it you try to build all of the input output that you want. But here this paper that came out I think in

September shows a proof of concept where you can all do all of these computations as a side effect of implementing input and outputs with analog signals. So you have all of these computations that are embedded as part of the hardware and based on pulses as input that simulates

your array values. These uh hardware architectures have some physical properties like you could think of kirhoff uh law in the like field of um I think intensity um you can add them up and it uses properties like this to have um what you need as input and just read out the

result uh as output. So uh when uh the paper simulated this kind of architecture uh they observed without uh too much surprise quite a bit of improvement both on the latency and energy saving parts. Uh both explained because you don't need to do the computations yourself. Uh you just get

them as a side effect of uh of your hardware. Now I want to take a step back and look at our users at our use cases of LLMs today and what could lie ahead. Uh what could be the most exciting for you. So today we've seen that in just a few years I think it has become quite

important to know how to use them if you want to speed up everything you you do in your daily life. So a few lectures ago we talked about the coding case where um do you have all these AI assistant coding tools that um enable enable you to turn into code some natural language prompts. So you just

you know ask for something and it will uh help you do that task with a so-called agent mode. And um this is just something that you would do as an engineer. But even beyond that uh other use cases are deeply impacted by it because you have um a lot of problems that today can be turned into a text to

query or text to code problem. Uh so you could think of even the visualization world. you could um so for example there was a launch from Google uh recently that showed that you could uh generate visualizations on the fly based on some principles and this is already changing um quite a bit the

picture of what you can do today. Uh something else that I think is used by most people actually today when using these chat bots is general uh like being a general assistant. So you ask about common facts and all the facts that it has learned at training time becomes useful. It browses the web um more

efficiently than you and converts into natural language the things that you care about. Um but then there are also other domains that were impacted by it. So you could think creativity where a lot of jobs such as marketing uh or others rely on uh getting something out of a blank page and usually if you start

from a draft it's much easier to get something done rather than just thinking of it from from scratch. So it's used as an eight here. And also one use case that I've seen in class that I think is is great that some of you do you know sometimes I talk about something or Afin talks about something and I see people

typing typing on JGPT related concepts and I think it's very smart to do that because brainstorming the concepts that you learn is great for actually grasping the concepts of interest and getting that early feedback loop is uh very useful for learning. So I have a lot of hopes regarding uh how

like how great of a time it is for you to learn as opposed to maybe uh you know a nice time maybe 10 years ago. So yeah keep doing that and I think it will be a growing use case. So looking forward um so I said tomorrow on the slide but actually two days ago there was a launch

uh that went in the direction of what I was thinking about which is uh like all the agentic things that we talked about they are still very much confined into people that know about the field like everyday people they wouldn't typically use quote unquote agentic workflows. So I think one field

of development that we will see more and more is all these use cases being democratized. So people can now create things that can be useful to them with easier um you know mediums just natural language no need to code. uh moving forward uh to later um so all

this AI assistant coding that I was mentioning you could think of it as helping you browse the internet in a very natural fashion so it seems right now when you just execute tasks you're way too microscopic in what you do and this is typically what uh AI assistant could help you do so there are like

recent product launches that reflect these growing interest such as chat GPT's atlas. So I think it launched in October. I don't know if they released some public number uh on usage. I suspect it's still timid because you still have challenges when it comes to security. Uh anyone could inject some uh

bad prompt in there and maybe exfiltrate things from you, but I'm sure the community will come up with uh more ways to get around it. So in the past you had https for example to say that the connection was secure. Maybe tomorrow you'll have some certificate that will guarantee that a site website is safe

for AI assistant browsing. um and looking even at a higher level, maybe just browsing on your uh desktop or your mobile phone at the LLM level. Uh at the OS level might be um something that the LLM can u can help. So when we talked about agents, we mentioned how um nonreliable it could be because as you

have more and more steps, the probability for a failure increases and stabilizing predictions is something of interest. And um even in the longer run, I think one test that we can have in mind as to how far we've come is whether the common use case of having a customer service

that is served by AI is truly useful. So I don't know about you, but every time I have a problem and I'm on the phone and I hear some AI assistant maybe LLM powered robot and like you know quick quick I want a human. I don't want that. And uh and I think it shows how hard this space is, the space of problems is

because human has way more dimensions of of value that an LLM could bring. So empathy, um like groundedness, there are some things that you and I we perceive as you know things that make sense even though they're not in our system prompts. So I think there there are hard problems to

to solve there. And even moving forward um there are some key challenges that we have with the current architecture. So um we saw during the class that you had to go through a training process that u went to like fix some weights but these weights are not changing afterwards. And

we use tricks such as rags a rag or tools to get around this issue. But could we think of a system that learns continuously? I think that is an open question. Then there is a topic of hallucinations which I put into quotation marks because I'm not sure if it's fair to say that the LLM

hallucinates just because we've trained the LLM to predict the next token by nature, not map statements to facts. So hallucinating is in some sense a core design uh choice of the these LLMs. Uh personalization, interpretability, safety, the the list goes on. Um now I want to briefly cover

what you can um like how you can exercise this muscle of staying up to date from now. So you have archive that uh usually contains all these great greatest and latest papers that you can take a look at. Of course the venues like new rips right now are great to highlight papers um like some papers

uh and then uh I highly encourage you be besides the papers uh looking at the associated code bases that the authors provide. So right now it's a common place to just provide the implementation of what you are proposing and I think it's very insightful to learn the concepts

and uh there is a paper with code that existed in the past and that has been replaced by hugging facees uh trending papers which I think is a good place to to take a look at the latest uh methods and then um on the uh social network side uh Twitter or X uh has a lot of u a lot of the latest that is often

discussed. So you have a strong community there and if you have an account on that social media you have a lot of great people to follow um to like stay updated but also you have resources on YouTube uh with a highlight on Yanik Kilchshire which I think was the first uh YouTuber to cover the transformer

paper back in 2017 in great detail and I think you know some of these YouTubers they're very good at um talking through um like papers in great detail. And another highlight is Andrish Karpath uh who was at Stanford about 10 years ago and he's I think one of the best educators out there. So I highly

recommend his videos and you have a company blogs that are also great and uh like this study guide that we associated with the class. Um, so we've had it for this year and what we'll try to do uh in the coming years is try to keep it updated at least on a yearly

basis. So you can consider this resource as maybe some companion and we've got the chance to collaborate with uh experts around the world to make it available in other languages in case you're interested. And taking a step back, just want to say that Afin and I were very grateful to

teach this class this quarter. Um, thank you so much for coming here, you know, on Friday evening, which is quite telling cuz, uh, you know, Friday evening is usually time for fun, not for lectures. And also now I think it's probably your last lecture of the whole quarter because uh, yeah, next week is

finals. So yeah, thank you for coming and for asking all these great questions. You were one of the reasons why this class was so great and interactive. Also, thank you to the folks who are watching online from home. I was one of you uh eight years ago. I would uh

almost never go to class, always watching lectures from home from a cozy place. I hope the lectures were entertaining and that you got something from it. Um, and I couldn't conclude uh without bringing our favorite teddy bear one last time. Thanking you uh all

for your attention and wishing you all the best. Thank you.

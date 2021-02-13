# Playing Around with Epi Models - Part 0


## Learning about epidemiology

Like most of you I knew next to nothing about epidemiology until a month ago. And also like most of you I am suddenly stuck at home with a lot of free time at my hands. And since it seems that in the next few months epidemiology will play a huge role in informing decision that can impact many thousands of lives, I decided that it may be a good idea to study the subject a bit in order to be able to have better informed opinions.

My plan was two-fold: first to go through a book on the topic, and then to find one or two mini-projects to practice what I've read. I got a hold of [this](https://www.springer.com/gp/book/9783319974866) book, which contained some useful code snippets. As for projects, I wanted to find some models that were a) recently created by respected epidemiologists so that I was dealing with the real stuff instead of toy examples, and b) came with open-source code so I could tweak or modify it.

## Age-specific SEIR model

The first model I was able to find that suited my goal was [this](https://alhill.shinyapps.io/COVID19seir/) useful and accessible dashboard by Alison Hill at Harvard's Program for Evolutionary Dynamics. It is a [SEIR](https://en.wikipedia.org/wiki/Compartmental_models_in_epidemiology)-type model that splits the population into susceptible, exposed but not infectious, exposed and infectious, asymptomatic carriers, three different severity levels of cases (mild, severe or hospitalized, and critical or ICU-bound), dead and recovered groups. 

The model already had a good deal of complexity, and a lot of effort had gone into choosing sensible parameter values based on available clinical data. One thing that was not included in it however was a split-by age of the population. 
Since COVID seems to be impacting people of various ages quite differently, it seems that incorporating an age structure into such a model would be a useful thing to do. That is what I set out to do. 

The end result can be found [here](https://demirev.shinyapps.io/SIRinterventions/). At this point the interface was getting a bit clunky, but it is still fully intractable and all parameters can be adjusted. The main difference from the original is that in my version the key parameters are vectors (one entry per age group) instead of scalars.

You can go ahead and check out the app or read the detailed description of the model in [this]() post.

## Agent Based Model of the Pandemic

The next model that I stumbled on is [this](https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(20)30457-6/fulltext) paper by Kucharski et al. It simulates individual-level transmission in various scenarios (at home, at work, at school, or other settings) while imposing various non-pharmaceutical interventions (such as mobile app tracking, household quarantine, manual tracing etc).

Instead of focusing on a single individual as in the original paper, I extended this model to simulate tens of thousands of individuals split into different households, workplaces, and class-rooms (depending on their age). The agents then interact with each other driven by specified encounter probabilities within their household and work/school.

The effect is that this model creates a sort of local pool of susceptibles (the household or the workplace/schoolroom). This result is somewhat smaller reproductive number estimates compared to a random mixing model.

You can read more about this model on [github](https://github.com/demirev/2020-cov-abm) or the detailed write-up in [this]() blog post.


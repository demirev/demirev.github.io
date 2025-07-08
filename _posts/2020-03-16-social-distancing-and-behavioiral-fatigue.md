---
title: 'Social Distancing and Behavioural Fatigue'
date: 2020-03-16
permalink: /posts/behavioural-fatigue/
tags:
  - models
---

## How do you contain a pandemic?

The rapid spread of the ongoing coronavirus pandemic has caught governments and health authorities around the world off-guard. As various emergency [emergency measures](https://www.bbc.com/news/world-europe-51810673) are placed in hold, it is becoming evident that different countries are choosing [different strategies](https://www.bbc.com/news/world-51737226) to contain the disease.

{{< admonition >}}
Big Disclaimer: I am not an epidemiologist or in any other way qualified to make judgments on effective disease prevention and containment. This post is just a layman’s attempt to understand the actions and choices of some of the world’s governments and should not be taken as advice or expert opinion.
{{< /admonition >}}

The goal of pretty much all of these strategies at this point is social distancing - the reduction in frequency of contact between members of society so as to slow down the spread of the virus. However, there are stark difference in the severity and the timing of measures adopted by different governments.

On one hand you have a number of countries (such as [Spain and France](https://www.ft.com/content/428babc4-66c9-11ea-800d-da70cff6e4d3)) that are implementing severe restrictions on everyday activity such as declaring school vacations, closing off bars and restaurants, canceling mass cultural events etc. Other countries (most notably the UK) however are only (as of midday 16.03.20) hinting at the [possibility](https://www.bostonglobe.com/2020/03/15/business/uk-eyes-plan-have-people-over-70-isolate-coronavirus-months/) of enacting such measures in the future and limit their current actions to softer measures such as PSAs and certain travel restrictions.

What is the rationale being the strategy of the UK? The main [stated reason](https://www.telegraph.co.uk/global-health/science-and-disease/containment-asia-working-people-learnt-sars/) is so called ‘behavioral fatigue’ - the idea that adherence to harsh distancing policies deteriorates with time, as people ‘tire out’, lose the sense of urgency or are unable to put off their jobs and obligations any more. Under this theory the government has to be careful in their decision to impose strict isolation rules, as doing so too early may mean that the measures become less effective in the future, when they could be even more necessary.

UK authorities have stated that their strategy is based on [computational simulations](https://www.bbc.com/news/science-environment-51874084) of disease propagation. In this post I attempt to build a very simple toy model to illustrate that under certain assumptions holding off extreme measures until the most opportune moment is the right thing to do.

## The effectiveness of social distancing

Let’s first begin by setting up a simple simulation model. I assume a fixed population comprised of $N$ citizens. Each citizen can be either *healthy*, *sick* or *recovered*.

The simulation is split up into phases or ‘days’. Each day each citizen has a fixed probability ($p_{contact}$) of having close contact and potentially transmitting the disease to exactly one other citizen.

The disease is non-lethal and lasts for a fixed number of days ($t_d$). After this the citizen becomes *recovered* and can no longer contact the disease.

The simulation is carried out for $T$
days and I record the total number of active cases at the beginning of each day.

```python
import random
random.seed(110011)

class Citizen():
  status = 'healthy'
  sick_for = 0

def simulate_epidemic(
  population_size = 1000,
  simulation_length = 100,
  meeting_probability = 0.1,
  sickness_duration = 21
):

  population = [Citizen() for i in range(population_size)]  
  population[0].status = 'sick' # patient 0

  daily_sick = []
  
  for day in range(simulation_length):
  
    n_sick = [1 if citizen.status == 'sick' else 0 for citizen in population]
    daily_sick.append(sum(n_sick))
    
    for citizen in population:
      
      if random.uniform(0, 1) < meeting_probability:
        other_citizen = random.choice(population)
        if citizen.status == 'sick' and other_citizen.status != 'recovered':
          other_citizen.status = 'sick'
        elif other_citizen.status == 'sick' and citizen.status != 'recovered':
          citizen.status = 'sick'
      
      if citizen.status == 'sick':
        citizen.sick_for += 1
        
      if citizen.status == 'sick' and citizen.sick_for >= sickness_duration:
        citizen.status = 'recovered'
  
  return(daily_sick)
```

The effect of implementing successful social distancing measures can be represented in our model by a lower probability of interaction between citizens ($p^∗_{contact}<$p_{contact}).

Let’s run two simulations each consisting of population of size $N=10000$ for a total of $T=300$ days, where the disease lasts for $t_d=21$ days. The only difference between the two will be the rate of social interaction with $p_{contact}=0.1$ representing the base scenario, and $p^*_{contact}=0.04$ representing social distancing.

```python
simulation_no_isolation = simulate_epidemic(
  population_size = 10000,
  simulation_length = 300,
  meeting_probability = 0.1,
  sickness_duration = 21
)

simulation_isolation = simulate_epidemic(
  population_size = 10000,
  simulation_length = 300,
  meeting_probability = 0.04,
  sickness_duration = 21
)
```

Plotting the resulting total cases per day in both scenarios shows a familiar graph, illustrating that social distancing can drastically reduce the maximum number of cases per day, and spread out the disease over time, thus limiting the stress on healthcare systems.

![No Fatigue Simulation]({{ '/images/posts/bf-plot1.png' | relative_url }})

## Behavioural Fatigue and not jumping the gun

Now let’s try to model behavioural fatigue. For this I will assume that social distancing measures can be effective for only a limited period - $t_{iso}$. During isolation the interaction rate is $p^∗_{contact}<p_{contact}$ otherwise it is $p_{contact}$.

The crucial thing thus becomes choosing when to enforce strict distancing measures. I will assume that measures are imposed when the total number of active cases reaches a certain proportion of the total population $P_{trigger}$. I also assume that those measures can be enacted only once (and after $t_{iso}$ days the interaction rate returns to its original value until the end of the simulation).

```python
def simulate_epidemic_fatigue(
  population_size = 1000,
  simulation_length = 100,
  meeting_probability_base = 0.1,
  meeting_probability_isolation = 0.04,
  sickness_duration = 21,
  isolation_duration = 14,
  isolation_trigger = 0.01
):

  population = [Citizen() for i in range(population_size)]  
  population[0].status = 'sick' # patient 0

  daily_sick = []
  days_in_isolation = 0
  
  for day in range(simulation_length):
  
    n_sick = [1 if citizen.status == 'sick' else 0 for citizen in population]
    daily_sick.append(sum(n_sick))
    
    if days_in_isolation == 0:
      if sum(n_sick) >= (isolation_trigger * population_size):
        days_in_isolation = 1
        meeting_probability = meeting_probability_isolation
      else:
        meeting_probability = meeting_probability_base
    elif days_in_isolation < isolation_duration:
      days_in_isolation += 1
      meeting_probability = meeting_probability_isolation
    else:
      meeting_probability = meeting_probability_base
    
    for citizen in population:
      
      if random.uniform(0, 1) < meeting_probability:
        other_citizen = random.choice(population)
        if citizen.status == 'sick' and other_citizen.status != 'recovered':
          other_citizen.status = 'sick'
        elif other_citizen.status == 'sick' and citizen.status != 'recovered':
          citizen.status = 'sick'
      
      if citizen.status == 'sick':
        citizen.sick_for += 1
        
      if citizen.status == 'sick' and citizen.sick_for >= sickness_duration:
        citizen.status = 'recovered'
  
  return(daily_sick)
```

I will simulate two different policies - one enforces strict distancing measures as soon as the total number of cases reaches $2$ of the population, the other only when it reaches $30$. In both cases the measures last for $t_{iso}=14$ days while the disease takes $t_{d}=21$ days to be cured. Other than that the two simulations are the same as before ($N=10000$, $p_{contact}=0.1$, $p^∗_{contact}=0.04$, $T=300$).

```python
simulation_early_trigger = simulate_epidemic_fatigue(
  population_size = 10000,
  simulation_length = 300,
  meeting_probability_base = 0.1,
  meeting_probability_isolation = 0.04,
  sickness_duration = 21,
  isolation_duration = 14,
  isolation_trigger = 0.02
)

simulation_delayed_trigger = simulate_epidemic_fatigue(
  population_size = 10000,
  simulation_length = 300,
  meeting_probability_base = 0.1,
  meeting_probability_isolation = 0.04,
  sickness_duration = 21,
  isolation_duration = 14,
  isolation_trigger = 0.30
)
```

The results of the simulations are plotted below. Under these assumptions acting too early has postponed the peak of the epidemic, but the maximum number of cases is almost as high as in the base scenario above.

Delaying the strict measures on the other hand has done almost nothing in terms of postponing the peak, but the maximum number of cases is lower that the ‘act too early’ scenario.

![Fatigue Simulation]({{ '/images/posts/bf-plot2.png' | relative_url }})

In this case the ‘acting too early’ scenario is no more that a postponement of the epidemic (under these assumptions the disease cannot die out due to $t_d > t_{iso}$). The ‘delayed measures’ scenario allows for the population to develop some degree of herd immunity before implementing the measures (since in this model once recovered a citizen can no longer carry the disease).

## So what’s the better strategy?

I wrote this post mostly to convince myself that the claims of the UK officials about why they aren’t acting faster in response to COVID19 can be justified by some simulation model.

This doesn’t mean that anything written here carries over to the real world. The models described here are extremely simple (no deaths, no seasonal effect, limited interactions, fixed illness duration, same behavior if ill or not, etc., etc.) and for illustration purposes only. Even these simplest of models still rely on many assumptions, most of which I made without much thought (and some of them I choose to better underline my point).

The idea of beheviour fatigue is [controversial](https://www.theguardian.com/commentisfree/2020/mar/16/social-distancing-coronavirus-stay-home-government) to [say](https://www.theguardian.com/world/2020/mar/13/behavioural-scientists-form-new-front-in-battle-against-coronavirus) the [least](https://www.ft.com/content/f3136d0a-663e-11ea-800d-da70cff6e4d3), and we still don’t know enough about COVID19, how it progresses and whether recovered patients do in fact become immune or not.

The professional epidemiologist who are fighting the pandemic undoubtedly have access to the highly advanced models, carefully developed for years, where each assumption is justified and defensible.

Let’s trust that they use these tools and their knowledge to make the best decisions for all our sake.


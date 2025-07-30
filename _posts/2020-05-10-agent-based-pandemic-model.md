---
title: 'Playing Around with Epi Models - Part 2'
date: 2020-05-10
permalink: /posts/heat-waves/
tags:
  - models
---

As a follow up to my last couple of posts, this is a detailed description of the agent based pandemic model I built on top of [work](https://www.thelancet.com/journals/laninf/article/PIIS1473-3099(20)30457-6/fulltext) by Adam Kucharski et al. as a self-learning exercise.

{{< admonition >}}
Code for this project can be found at [https://github.com/demirev/2020-cov-abm](https://github.com/demirev/2020-cov-abm)
{{< /admonition >}}


## Model Description - Agent-Based Pandemic Model

The model simulates a population of agents divided in households and workplaces who interact (and expose each other to the disease) on a daily basis.

![Agents in the model]({{ '/images/posts/epi2-population.png' | relative_url }})

There are four types of agents based on their age group:
* children
* adults
* middle-aged
* pensioners

Every individual belongs to a **household**. The distribution of household in terms of age makeup and size is determined by the user.

Adults and Middle-aged agents are also assigned to **workplaces**. Children are assigned to 'classrooms' with other children. Pensioners are not assigned to a workplace.

The simulation progresses in 'days'. It begins with a small number of infected individuals defined by the user. Each day the infected agents interact with others who become exposed to infection:

![Agent interaction]({{ '/images/posts/epi2-interactions.png' | relative_url }})

I assume that the infected agent meets a number randomly drawn agents from their workplace as well as a number of randomly drawn agents from the population at large. The number of meetings is determined for each infected agent by drawing an observation from the interaction data set from the Pandemic study by [Krepac et al](https://www.medrxiv.org/content/10.1101/2020.02.16.20023754v2). Exposed agents face a certain user-defined probability of becoming infected (see section on default parameters).

I assume that infected agents also expose *everyone* from their own household (at least in the baseline scenario with no interventions). Exposed household members also face a user-defined probability of becoming infectious. For convenience this exposure is done on day 1 of the infection, so this probability should be thought of as the total probability that an exposed household member gets infected throughout the infectious period.

The next day the newly infected agents are added to the list of disease-spreaders and the simulation is carried over again. A simple *SIR status is kept for each agent:

![Agent status]({{ '/images/posts/epi2-status.png' | relative_url }})

This means that as the disease progresses, the number of susceptible individuals in the population, but also in individual households and workplaces will decrease, and the disease will naturally slow down at some point (note: this will tend to happen earlier because of the compartmentalization of agents into households and workplaces compared to a simulation without this complication).

Throughout the simulation a record is kept of who infected who when. This allows us to compute the **effective average reproduction number** at each time point.

The basic interaction rules described above can be altered by specifying a disease-preventing non-pharmaceutical intervention, which I will cal 'policies' for short. 

The list of available policies is given below. It is the same set of interventions as in [Kucharski et al](https://www.medrxiv.org/content/10.1101/2020.04.23.20077024v1).

* **no_measures** - the baseline scenario.
* **isolation_only** - individuals who test positive are isolated and can no longer infect. Only a fraction of infectious agents will get tested each day.
* **hh_quarantine_only** - in addition to the above, individuals in the household of the ones who tested positive are traced, tested and isolated if needed (i.e. they don't contribute to spreading the infection further).
* **hh_work_only** - as above plus same treatment of coworkers.
* **isolation_manual_tracing_met_only** - all contacts are traced (household, work and other) as long as they were contact known to the infected individual beforehand (this is an adjustable parameter). The idea is that in manual tracing you cannot trace stranger.
* **isolation_manual_tracing_met_limit** - same as above but also imposing a hard limit on number of social interaction outside the household or work (akin to social distancing measures)
* **isolation_manual_tracing** - assume every contact can be traced (including those that were strangers to the infected individual)
* **cell_phone** - tracing using smartphone app. Same as isolation_manual_tracing (phone apps allow to trace strangers) but limited by number of people owning a phone.
* **cell_phone_met_limit** - same as above plus a hard limit on outside of work and home interactions.
* **pop_testing** - random testing on a certain fraction of the population each day and isolation of those who tested positive only (a la Romer)
* **pt_extra** - as far as I understand an umbrella for any intervention that reduces the chance of infection given exposure (e.g. mandatory mask wearing). The degree of reduction is a parameter in the model.

## Possible Future Extensions

Obviously some aspects of disease spread are simplified in this model. However some complications can be introduced relatively easily. Namely the duration of the disease is currently fixed but can be made variable and dependent on age. SIR groups can be augmented with additional status groups to model hospital admission, ICU care, death or lose of immunity (and the transition between groups can be made dependent on age).

## Example
I will give a short example of how to use the model and the code. It is the same one that can be found in the file `scripts/contact_abm_model.R`

### Defining social behavior of each age group

Each age group in the model meets with other people based on interaction data such as the one provided by Fry et al. The first step is to define this interaction distribution:

```r
# load contacts data
contacts <- bind_rows(
  read_csv("data/contact_distributions_u18.csv") %>%
    mutate(age = "student"),
  read_csv("data/contact_distributions_o18.csv") %>%
    mutate(age = "adult"),
  read_csv("data/contact_distributions_o18.csv") %>%
    mutate(age = "middle_age"),
  read_csv("data/contact_distributions_o18.csv") %>%
    mutate(age = "pensioner") %>%
    mutate(e_work = 0) # pensioners don't work
)
```

This is a little coarse since I only have data for over/under 18 rather than for more detailed age brackets, but this can be remedied in the future

### Creating a population of agents

The next step is to create a population of agents for the model. This is done by listing household types and the number of such households to include in the simulation.

```r
# define initial population
init_pop <- generate_population(
  household_distribution = list(
    tibble(n = 100000, student = 0, adult = 2, middle_age = 0, pensioner = 0),
    tibble(n = 100000, student = 1, adult = 2, middle_age = 0, pensioner = 0),
    tibble(n = 10000, student = 2, adult = 2, middle_age = 2, pensioner = 2),
    tibble(n = 50000, student = 0, adult = 0, middle_age = 0, pensioner = 2)
  ),
  average_workplace_size = 40,
  average_classroom_size = 25
)
```

In principle this should be available from census data.

We also need to define the number of initial infected individuals in each age group:

```r
# define initial infected individuals
init_inf <- generate_initial_infected(
  init_pop,
  n_initial_infections = c(
    "student" = 5,
    "adult" = 5,
    "middle_age" = 5,
    "pensioner" = 5    
  ),
  contact_distribution = contacts
)
```

### Simulating outbreaks

The main workhorse function of the model is `simulate_pandemic_policy_sequence`. It takes the initial population defined above and simulates a sequence of different intervention policies for a specified number of days. 

Below I simulate the baseline policy for $120$ days. Note the format of the `policy_sequence` parameter.

```r
simulation_baseline <- simulate_pandemic_policy_sequence(
  initial_population = init_pop,
  initial_infected = init_inf,
  initial_recovered = tibble(individual_id = "")[0,],
  policy_sequence = list(list(scenario = "no_measures", n_days = 120)),
  contact_distribution = contacts
)
```
The code is somewhat time consuming, with this simulation loop taking around 11-12 minutes on my personal laptop.

The resulting data allows us to plot the different **SIR** groups through time:

![SIR baseline]({{ '/images/posts/epi2-sir_baseline.png' | relative_url }})

Or just the number of infected individuals at each day:

![Infected baseline]({{ '/images/posts/epi2-i_baseline.png' | relative_url }})

Finally we can plot the effective reproduction number at each day (the plot is noisy in the beginning and end of the simulation due to having only a few infected individuals at those times):

![R by day]({{ '/images/posts/epi2-rt_baseline.png' | relative_url }})

### Simulating the effect of different interventions

To compare different interventions, I will run one simulation for each intervention scenario, where first the disease spreads unchecked for $20$ days and then the intervention is put in place for $100$ days:

```r
simulation_all_scenarios <- c(
  "isolation_only","hh_quaratine_only","hh_work_only",
  "isolation_manual_tracing_met_only","isolation_manual_tracing_met_limit",
  "isolation_manual_tracing","cell_phone","cell_phone_met_limit",
  "pop_testing","pt_extra"
) %>%
  future_map(function(scn) {
    simulate_pandemic_policy_sequence(
      initial_population = init_pop,
      initial_infected = init_inf,
      initial_recovered = tibble(individual_id = "")[0,],
      policy_sequence = list(
        list(scenario = "no_measures", n_days = 20), # assume 20 days before measures are taken
        list(scenario = scn, n_days = 100) # let simulation run for total of 120 days
      ),
      contact_distribution = contacts
    )
  })
```

We can now compare the total number of infected (with possible implications for the burden to the healthcare system) for each scenario:

![Infected all scenarios]({{ '/images/posts/epi2-i_all_scenarios.png' | relative_url }})

The plot clearly shows that some policies are much more effective than others and some can even lead to disease eradication in these simulations. This is furthers confirmed by looking at $R_t$ for each simulation and noting that it falls well below $1$ for some of them (the plot is noisy at times because of the low number of infected agents at the beginning and end of disease spread):

![Disease reproduction all scnearios]({{ '/images/posts/epi2-rt_all_scenarios.png' | relative_url }})

### Multiple simulations and non-trivial policy schedules

The above plots show the results of running the simulation only once per scenario. Since there is inherent randomness in such models, it is better to conduct several simulations and average the results. This can be done through the `simulate_pandemic_policy_sequence_ntimes` function, which as the name suggests is just a wrapper around `simulate_pandemic_policy_sequence` that repeats the simulation for a specified number of times.

```r
simulation_specific_policy <- simulate_pandemic_policy_sequence_ntimes(
  initial_population = init_pop,
  initial_infected = init_inf,
  initial_recovered = tibble(individual_id = "")[0,],
  policy_sequence = policy,
  n_times = 8, # run 8 simulations of the same policy
  contact_distribution = contacts
)
```

One can also use this model to simulate an arbitrary sequence of intervention policies (e.g. a regime of on-and-off social distancing or a policy of initial manual tracing later replaced by cell phone tracing).

To do this just define a `policy` list as the one below (specifying the duration in days of each policy):

```r
policy <- list(
  list(scenario = "no_measures", n_days = 10),
  list(scenario = "hh_quaratine_only", n_days = 20),
  list(scenario = "hh_work_only", n_days = 20),
  list(scenario = "isolation_manual_tracing_met_only", n_days = 20),
  list(scenario = "cell_phone", n_days = 20),
  list(scenario = "pop_testing", n_days = 30)
)
```

Plotting the outputs of `simulate_pandemic_policy_sequence_ntimes` will show the result of each simulation as well as the average across simulations:

![Plot of multiple simulations](i_complex_policy.png)

## Default simulation parameters

```r
inf_period = 5, # Infectious period
max_low_fix = 4, # Social distancing limit in scenarios with hard limit
wfh_prob = 0, # Probability people are working from home
trace_prop = 0.95, # Proportion of contacts traced 
app_cov = 0.53, # App coverage
prob_symp = 0.6, # Proportion symptomatic
prob_t_asymp = 0.5, # Transmission probability if asymptotic
isolate_distn = c(0,0.25,0.25,0.2,0.3,0), # distribution of time to isolate in the scenarios with isolation (1st day presymp)
pt_extra = 0, # Optional extra transmission intervention probability
pt_extra_reduce = 0, # Reduction from extra intervention
hh_risk = 0.2, # HH risk (total)
cc_risk = 0.06, # Outside HH contact risk (per daily exposure)
trace_adherence = 0.9, 
p_pop_test = 0.05, # Proportion mass tested (5% per week)
trace_hh = 1, # Proportion of household members traced in scenarios involving tracing.
met_before_w = 0.79, # Proprotion of meetings which are with familiar people at work. At school = 90%
met_before_h = 1, # Within HH
met_before_o =  0.52 # In other settings
```


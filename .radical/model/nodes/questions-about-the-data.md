---
id: "83816ea6-8c1f-42fc-bc74-944304c249f5"
type: "requirement"
label: "Questions about the data"
action: "answer with one sentence (the figure, the run it comes from and, for a change, whether it is beyond the noise between runs), a chart of the runs over time with the fitted line for a change, and a table of the runs behind the answer with a link to each, opening a fastest stretch selected on the run"
ears_type: "event-driven"
rationale: "The runner wants the app to go beyond blocks and comparisons: \"chce miec mozliwosc doglebnej analizy danych ktore sa\", with the examples \"pokaz mi jak sie zmieniala efektywnosc od lutego\" and \"pokaz mi najszybszy bieg 10 min od marca\"; the fastest 10 min is \"Najszybszy fragment 10 min: W każdym biegu od marca szukany jest najszybszy ciągły odcinek 10 minut; odpowiedź to najlepszy z nich (bieg, minuta startu, tempo), plus ranking kolejnych\", the form \"Wykres + tabela + zdanie\", and the statistic \"chce miec mozliwosc wyboru sposobu agregowania danych ... i rodzaju metryki , avg, min, max , mediana\". The verdict of a change uses the Trend rule on the runs' values, with 5 runs needed as for a block (model's choice); 10 as the default length of a ranking, and the median and extremes read from the run's 10 s windows with movement (so one odd sample is no extreme) while the average is over the moving samples, are the model's choices."
trigger: "the user asks how a metric changed over a period, for the fastest stretch of a length (minutes or kilometres) in the runs of a period, or for the runs with the highest or lowest metric, each run counted by the statistic chosen (its average, median, minimum or maximum), with or without a tag, shoes or a title"
---

---
id: "05240177-b3c1-4608-8c25-f98e141ec0cb"
type: "scenario"
label: "Theme follows the system"
gherkin: |
  And when the user chooses "Light" the application switches to the light theme and keeps it on the next launch
  And when the user chooses "Automatic" it follows the computer's theme again
given: "the computer uses a dark theme and the user never chose a theme in Strideprism"
then: "the application shows the dark theme"
when: "the user opens the application"
---

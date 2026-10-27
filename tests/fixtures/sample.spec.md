# Sample spec (runner self-test)

- Adding numbers.
  `[@test] ./sample.steps.ts`

```gherkin
Feature: Adding
  Scenario: captures and any keyword
    Given the number "2"
    And the number "3"
    When I add them
    Then the sum is "5"
    When I add "4" more
    But the sum is "9"

  Scenario: fresh context
    Then no numbers are stored
```

- Belongs to another step file.
  `[@test] ./other.steps.ts`

```gherkin
Feature: Other module
  Scenario: never selected
    Given a step nobody defines
```

- Python side.
  `[@test] ../../tools/tests/steps_x.py`

```gherkin
Feature: Python only
  Scenario: never selected either
    Given a step nobody defines
```

Inherits the nearest preceding link (the Python one), so not selected.

```gherkin
Feature: Inherited
  Scenario: not selected
    Given a step nobody defines
```

  `[@test] ./sample.steps.ts`

```gherkin
Feature: Second block
  Scenario: also selected
    Given the number "1"
    Then the sum is "1"
```

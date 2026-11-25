---
title: The escape burn
description: How fast does a spacecraft need to go to leave a planet for good?
---

# The escape burn

A spacecraft fires its engine along its direction of travel. What happens when the burn ends depends on its speed at that distance from the planet.

## The rule

Below local escape speed, the spacecraft stays gravitationally bound. At escape speed or above, it can leave without another burn. This model assumes one planet and ignores the atmosphere.

```js
const canEscape = speed >= localEscapeSpeed;
```

## Try a burn

Compare a speed just below the threshold with one at or above it. Speed is shown as a multiple of local escape speed.

![Escape speed experiment](./burn.js)

## Flight check

![Flight check](./check.json)

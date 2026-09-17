# UX Principles

## 1. If the next step is known, surface it

When the user completes an action and the app knows what
they must do next, don't send them to another screen to find it.
Surface it in place.

**Apply when:**
- The next step is required (not optional)
- The next step has one obvious default
- It's a single choice or a single field

**Do:**
- Create product → open "set stock" modal in place
- Create branch → prompt for name + address before saving
- Add to cart → keep the cart panel visible

**Don't:**
- Chain three or more steps into a modal
- Pre-fill a choice that the user will often override
- Skip permissions — respect the role and fall back gracefully

**Anti-pattern:**
"Product created. Go to Inventory → find the product → click
the stock icon → enter stock." Four clicks for one task.
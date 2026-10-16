## vstack

For any change beyond a trivial edit, run it as a vstack flow: `vstack start <feature|bugfix|refactor|investigate|spike> "<goal>" --size S|M|L`. Then do what `vstack` prints and advance with `vstack done "<evidence>"`. The CLI hands out one step at a time, so don't read ahead. Details are in the `vstack` skill.

Always: name the data shape before the logic. Make the smallest diff that solves it. Prove it on the real surface before you say done. Give evidence, not claims (what you ran, what you saw). No narrating comments, type escapes, or swallowed errors. Ask only for decisions you can't settle by running something.

# brew

This provider records installed Homebrew formula and cask versions.
It uses two local inventory commands:

```sh
brew list --formula --versions
brew list --cask --versions
```

The provider does not map package names to executable names.
It does not check remote versions or modify Homebrew state.

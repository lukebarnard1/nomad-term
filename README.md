
# nomad-term
A terminal multiplexer based on [xmonad](https://xmonad.org)

nomad-term is a terminal multiplexer that provides a similar interface to the tiling window manager, [xmonad](https://xmonad.org). It harnesses the powerful [node-pty](https://github.com/Microsoft/node-pty) to fork processes as if they were within the context of a terminal.

The result is a grid-based terminal multiplexer with the same features provided by xmonad within the X windowing system but in the context of any ANSI-compliant terminal.

*A GIF of nomad*:
https://lukebarnard.co.uk/img/nomad-term-2.gif

## Installation

_Disclaimer_ - Please use at your own risk:
 - nomad-term is not yet officially released, this is a POC.
 - nomad-term has not been audited for security and may be vulnerable to malicious attacks via the output of a program running within it.
 - The author will exercise best effort to make sure any security patches are communicated, including for that of dependencies.

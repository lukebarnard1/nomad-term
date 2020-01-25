
Break the string up into sequences of graphical characters and control
sequences. Grapihcal characters are essentially bytes that are not in
control sequences.

We basically need to incrementally test the input string like so:
 - s0 = str[0]
 - s1 = str[0:1]
 - s2 = str[0:2]

 until s{i} matches a control sequence OR it is not possible for it to
 match any control sequence.

 We need quick evaluation of whether s is contained or is equal to any of
 several sequences.

 Example: three sequences
   SEQ1: ESC [ p0 ; p1 A
   SEQ2: ESC [ p M
   SEQ3: ESC [ a

   str = 'ESC[123;43A'

   s0 = ESC (possibly matches 3)
   s1 = ESC [ (possibly matches 3)
   s2 = ESC [ 1 (possibly matches 2)
   ...
   s8 = ESC [ 123 ; 43 A (matches exactly 1)

 It might be more efficient to break the input up into tokens
 and the control sequences into a grammar.

 In the above example, SEQs share 'ESC [' (CSI) and so at the root of our
 grammar is CSI

  CSI := ESC [
  PRM := ([0-9]+)
  CTL := ([a-zA-Z])
  PRE := ([a-zA-Z]?)
  PRM2 := PRM ; PRM
  PRMS := PRMS ; PRM
       := PRM?

  SEQ := CSI PRE PRMS CTL

 seqs:
  HVP := CSI PRM ; PRM f

 By following the grammar, we can break down the input string by first
 parsing it into tokens, starting with finding CSI.

 For example, the tokens in HVP would be parsed into the following:
  'ESC 1 ; 2 f'
  { prms: [ 1, 2 ], ctl: 'f' }

 this would later be matched to HVP which is described similarly:
  HVP = { ctl: 'f', prms: true }

 but this could be written in js as such:
  HVP: 'CSI PRM ; PRM f'

 TODO:
  - function to parse input string, remembering that characters before a
  control sequence are all graphical. This function is the only function
  aware that the bytes currently being processed are part of a control
  sequence. We can also assume that control sequences are valid and will
  terminate. So for bytes that are e.g. "blabla CSI 3 ; 3 -", the function
  should expect the sequence to terminate e.g. when later called with the
  rest of the data as it buffers in. Here, "blabla" can be assumed to be
  graphical - anything before CSI is graphical. everything after is a part
  of a valid sequence until the sequence terminates, and so on. After
  consuming a single sequence, the function can call itself with the rest
  of the bytes as input to continue consuming.

  Example algo:
   - find first CSI, add text before it
   - replace anything that matches [0-9;]+ with PRMS
   - output string "fits" e.g. CSI PRMS m

   tokenised into something like [
     {text: 'blabla'},
     { seq: { params: [30, 40], fits: 'CSI > PRMS f' ]

     OR

     { seq: { params: [30, 40], {ctl: 'f'}, {pre: '>'} ]
     // XXX: I honestly think the most efficient, flexible option is to
     define a matching sequence as "CSI PRMS s" for example, then take an
     input and replace it with literal 'CSI' and 'PRMS', before matching
     against existing definitions in constant time.

- function to map the above parsed "seq" to the name of the sequence, e.g.
  HVP by quickly comparing against a few static rules. For HVP, the ctl is
  f but it does not have a pre of ">" so it would not match.

  The output should be [
    {text: 'ignored'},
    { seq: { fn: 'HVP', params: [30, 324] }
  ]

 - function for each "fn" that will convert the parameters into an action
/  to be taken on subterminal state... or just do the work on state, more
 likely. e.g. for HVP, the function would set the horizontal and vertical
 position of the cursor. This could be written as a function that accepts
 cursor state, returns new state in its place.


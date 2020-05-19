
for i in {1..128}; do
  printf "\e[38;5;$((i));5mblink\e[m now supported! "
  printf "\e[38;5;$((i + 1));5mblink\e[m now supported! "
  printf "\e[38;5;$((i + 2));5mblink\e[m now supported! "
  printf "\e[38;5;$((i + 3));5mblink\e[m now supported!\n"
done

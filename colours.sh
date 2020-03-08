for i in {1..255}; do
  printf "\e[38;5;$i""m hello\e[m \e[48;5;$i""m\e[37mhello\e[m"
  if [[ $((i%=8)) -eq 0 ]];
    then printf "\n";
  fi
done

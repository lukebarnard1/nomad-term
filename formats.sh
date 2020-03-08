for j in {1..10}; do
  for k in {1..10}; do
    for i in {1..10}; do
      printf "\e[$j;$k;$i""mx\e[m"
      printf "\e[$j;$k;$((i + 30))mx\e[m"
      printf "\e[$j;$k;$((i + 40))mx\e[m"
      printf "\e[$j;$k;$((i + 90))mx\e[m"
      printf "\e[$j;$k;$((i + 100))mx\e[m"
    done
  printf "\n"
  done
done

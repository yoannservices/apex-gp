#!/bin/sh
# Usage : sh multi-contacts.sh apex|moto  -> contacts sur 3 circuits
g=$1
for t in $( [ "$g" = moto ] && echo "mugello assen jerez" || echo "velocita ville collines" ); do node contacts.js $t 2 2 $g | sed 's/hors-course[^,]*,\?//'; done

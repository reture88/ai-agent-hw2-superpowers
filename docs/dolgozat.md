# Fejlesztési tapasztalatok — Customer Geo-Distance Service

Ez a dokumentum a `feature/customer-geodistance-service` funkció Claude Code (superpowers workflow) általi, ágens-vezérelt fejlesztésének tapasztalatait foglalja össze.

## Setup és tanulási görbe

Nem volt nehéz, command line ból egyszerű volt a telepítés, a finkciók skillek használatára nem kellett felszólítani, ha a plugin aktív, a feladattól függöt milyen skilleket használt. 

## Steering

A kezdeti promptal kapcsolatba nem kevés visszakérdezése volt(15-20 biztos), de jogos "irány választó" kérdések(milyen technológiák legyenek használva, a kezdeti prompt-ban opcionálisnak írt dolgokkal mi legyen) amikből egy rövid specifikációt rakott magának össze a claude, felszólított engem annak áttekintésére a továbbhaladás előtt.

## Tervezési fázis

A SPEC-et jóváhagyva egy 1000+ soros részletes PLAN-t rakott össze (az alfeladatokról, a feladatot nem érintő dolgok, commit terv, stb)  amivel kapcsoltaba újra megkért hogy tekintsem át továbbhaladás előtt. Itt megkérdezte, hogy subagentekkel végeztese el az altaskokat, vagy az aktuális terminal sessionjében dolgozzon a calude(sub agentet választottam). Nem volt szembetűnő eltérés a tervezettektől.

## Kód minősége

A létrejött mappa struktúra átlátható és logikus. A projekt fileok tartalmai tömörek és átláthatóak. Tesztek készítésére nem kellett felszólítanom, magától megírta. Nem kellet extra instrukciókat adnom arra hogy a termék fel legyen készítve az esetleges null értékekere a lat/lng mezőkben, azt magától rendezésekkel megoldotta a végponton(a seeder-t meg felkészítette).

## Kontroll

Nem volt szükséges kézzel átvennem az irányítást, a kérdéses dolgokat elémrakta kiválasztásra, utána a kiválasztás/általam jóváhagyott terv szerint dolgozott.

## Összegzés

Még nem végesztem a BMAD-el így azzal nem tudom összehasonlítani, de ebben a feladatan a superpowers nekem tetszett, hatékonynak éreztem. Tetszett, hogy egy részletességre törekvő alap promptból segített egy claudecode számára használható részletesebb specpecifikációt összerakni, és abból meg fejlesztési tervet. Kissebb projektekre biztos hasznos ezköznek találom. Szerintem nagyobb DDD projekten szintén jól teljesítene.

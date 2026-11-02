# great-name

## Struktura

- `client/` - strona, renderer, budowanie siatek z height map, tekstury i fonty.
- `server/` - serwer WebSocket, rejestracja, pozycje graczy i generacja terenu.

Serwer nadaje graczowi pozycje w swiecie i generuje jego poczatkowe otoczenie.
Klient nie otrzymuje absolutnej pozycji ani seeda mapy. Rysuje teren
w lokalnym ukladzie, w ktorym gracz stoi w `[0, 0, 0]`, a kamera krazy wokol niego.
Sterowanie: przycisk **Graj**, WASD do chodzenia, mysz do obrotu kamery,
Esc do menu. Chodzenie liczy wylacznie serwer; wysokosc gracza dopasowuje
do terenu. Spacja uruchamia pojedynczy skok z ziemi (~2 m), liczony
przez serwer; powtorzenia klawisza i dodatkowe skoki w powietrzu sa pomijane.
Nachylenie stoku nie wymusza zjazdu ani nie ogranicza WASD;
gracz zachowuje zwykly chod i skok, takze na stromym terenie.
Kostki do zbierania pozostaja wylaczone.
Wlasny gracz i inni pobliscy gracze maja wspolny, autorski model wedrowca:
geometryczna peleryne, kaptur i zloty szal. Kontroler `CameraController`
obsluguje wylacznie TPP; inne typy kamer wymagaja osobnego kontrolera.
Kamera krazy wokol glowy (wysokosc 3.3 jednostki).
Dystans zalezy plynnie od nachylenia: 10 jednostek
przy -30 stopniach, 13 przy poziomym widoku i 26 przy 70 stopniach.
Mysz obraca ja wokol gracza, WASD dziala wzgledem
kamery. Postac obraca sie w kierunku ruchu, nie podczas samego obrotu kamery.
Katy sa wygladzane krytycznie tlumiona sprezyna zalezna od czasu,
nie liczby klatek. Zakres pionowy wynosi od -30 do 70 stopni
(minimum 60 stopni od pionu w dol). Kamera nie zbliza sie do modelu postaci.
Kamera zachowuje wybrany kat niezaleznie od czasu bez ruchu myszy
i kierunku postaci; nie wraca automatycznie za plecy.
Czulosc jest procentem (domyslnie 100%), takze przed pierwszym otwarciem ustawien.
Kamera unosi sie ponad otrzymana height mape, takze podczas lerpowania;
kolizja z terenem ma pierwszenstwo przed wygladzaniem.
Petla klienta korzysta z `requestAnimationFrame`, zsynchronizowanego z ekranem,
zamiast timera 30 Hz. Najpierw aktualizuje teren, kamere, animacje i ruch,
a dopiero potem rysuje cienie i obraz. Delta czasu nadal ma limit 0.1 s
po powrocie z nieaktywnej karty; `start()` nie uruchamia drugiej petli.
Stan serwera ustawia docelowe przesuniecie terenu, wygladzane przy kazdej
klatce (lerp wykladniczy, 12/s), zamiast przesuwac swiat w momencie pakietu.
Kamera sprawdza kolizje na narysowanym terenie, a inni gracze korzystaja
z tego samego przesuniecia. Nie dodajemy surowych przesuniec sieciowych do
kamery. Teren i kamera sa aktualizowane przed renderowaniem.
Nowa mapa ustawia nowe przesuniecie bez mieszania ukladow roznych rewizji.
To wygladzanie obrazu, nie lokalna symulacja ani zmiana autorytetu serwera.
Obrot TPP uzywa mniejszej czulosci (0.08 stopnia
na jednostke osi przy ustawieniu 100%), niezaleznej od czasu klatki.
Zegar klienta uzywa czasu monotonicznego i ogranicza krok do 100 ms.
Predkosc na serwerze wynosi 13 jednostek/s; pozycja nadal
jest wylacznie autorytatywna, bez lokalnego przemieszczania gracza.
Otworz strone w dwoch kartach, aby sprawdzic multiplayer. Nowy gracz
pojawia sie w poblizu juz polaczonego gracza.
Klient laczy sie automatycznie; status i bledy sa widoczne w konsoli
przegladarki, a oczekiwanie na teren takze na stronie.
Po rozlaczeniu usuwa poprzedni teren i ponawia polaczenie co 2 sekundy.
Bez serwera nie jest generowany zaden lokalny teren.

Gra wypelnia cale okno przegladarki. Canvas dopasowuje rozdzielczosc
do rozmiaru okna i gestosci pikseli ekranu, do budzetu 1366 * 768 pikseli;
kamera aktualizuje proporcje
po zmianie rozmiaru. Menu i ustawienia pozostaja nakladkami na gre.

### Renderowanie

### ParticleSystem (klient)

`PlayerDust` na lokalnym graczu korzysta z tej samej puli czastek:
emituje kurz co 1.8 jednostki biegu po ziemi oraz przy odbiciu i ladowaniu.
Odczytuje faktyczne przesuniecie renderowanego terenu i wysokosc ziemi,
nie same klawisze; stanie i lot nie tworza ciaglego sladu.
Czastki pozostaja w swiecie za stopami, zanikaja po 0.45--0.95 s
i sa czyszczone przy podmianie terenu lub utracie polaczenia.
Pula ma 160 miejsc i jeden renderable; nie tworzy aktora na kazdy krok.
Kurz korzysta ze zwyklego mieszania alfa i oswietlenia pory dnia,
zamiast addytywnego blasku czastek wiatru.
Predkosc uderzenia z serwera skaluje ladowanie: 12--96 czastek o skali
0.65--2.4 (pelna sila przy 24 jednostkach/s). Efekt czeka na wizualny kontakt
z ziemia, zeby wygladzanie ruchu nie oslabialo ani nie przyspieszalo dymku.
`WandererAnimation.landingCrouch` ugina nogi i obniza tulow proporcjonalnie
do tego samego uderzenia, po czym zanika; dziala tez na zdalnych awatarach.
`ParticleSystem` przyjmuje tez opcje `continuous: false` (pusta pula dla
`emit(count, position, scale = 1)`) i `worldSpace: true` (bez dziedziczenia obrotu emitera).

`ParticleSystem` jest komponentem aktora z `Transform`. Przyjmuje sciezke
do pliku JSON albo obiekt o tym samym ksztalcie. Przyklad w scenie:

```js
new Actor('wind', [
    new Transform(),
    new ParticleSystem('./particles/wind.json')
]);
```

Testowy efekt `client/particles/wind.json` to 240 drobinek piasku niesionych
wiatrem wokol lokalnego gracza. Symulacja, losowanie i renderowanie sa
wylacznie klientowe; serwer nie przesyla czastek. Jest to efekt atmosferyczny
w lokalnym ukladzie, bez kolizji z terenem i bez proceduralnej generacji mapy.

Pola JSON (wszystkie wymagane):

- `count`: liczba czastek, 1..2048;
- `lifetime`: zakres czasu zycia `[min, max]` w sekundach;
- `size`: zakres srednicy w jednostkach swiata, oba konce dodatnie;
- `spawn`: obszar emisji `{ "min": [x,y,z], "max": [x,y,z] }`;
- `velocity`: zakres predkosci, ten sam ksztalt, jednostki/s;
- `acceleration`: `[x,y,z]`, jednostki/s^2;
- `turbulence`: nieujemna amplituda pionowego falowania;
- `color`: `[r,g,b,a]`, kazdy kanal 0..1.

Pula jest wstepnie wypelniona czastkami w roznym wieku; czastki wygasaja
plynnie i odradzaja sie. Caly system ma jeden renderable, jeden dynamiczny
bufor i jeden draw call (`POINTS`), bez tekstur ani osobnych aktorow czastek.
Rozmiar ekranowy jest ograniczony mozliwosciami GPU.
Efekt jest rysowany po nieprzezroczystej scenie i niebie, z addytywnym
blendingiem, testem glebokosci i bez zapisu glebokosci; nie rzuca cieni.
Po rysowaniu przywraca stan blendingu i zapisu glebokosci.
Wylaczenie komponentu anuluje pobieranie i zwalnia jego aktora oraz zasoby GPU.
Bledy pliku/JSON sa raportowane w konsoli i zdarzeniem `particleserror`.

### Kamienie

`Stone` jest wspolna baza dla `ErodedStone` (obly erodowany glaz) i
`MonolithStone` (wysoki asymetryczny monolit). Seed ustala punkty szumu
Voronoi, proporcje, obrot i odcien. Ciagle pole F2-F1 deformuje bryle,
a normalne usredniane na wspolnych wierzcholkach daja smooth shading.
Male modele maja 720 trojkatow, dominanty 2976 i druga skale deformacji
Voronoi. Wielkie skaly obu typow sa smukle i pochylone o 12-25 stopni
jak wbite w piasek. Szum jest liczony tylko przy budowie, nie co klatke.
Material dodaje nieregularne, przerywane mineralne pekniecia, drobne przebarwienia
i piasek przy podstawie; proceduralne wspolrzedne pozostaja przy geometrii.
Ten sam seed, typ i rozmiar daja ten sam model. Bez tekstur koloru:

```js
new MonolithStone({ seed: 123, size: 14, material: stoneMaterial, shadowMaterial });
new ErodedStone({ seed: 456, size: 10, material: stoneMaterial, shadowMaterial });
```

Generator dodaje `stones: [{ seed, type: 'eroded' | 'monolith', size, position: [x,y,z] }]`.
`size` to wysokosc modelu w jednostkach swiata (1 jednostka ~ 1 metr), zakres 1-40.
Pozycje sa wzgledem chunka i poczatkowej wysokosci snapshotu, bez absolutnych
wspolrzednych swiata. W komorkach o rozmiarze 512 jednostek
powstaje dominanta 25-40 m z 2-3 towarzyszacymi skalami 2-4 m.
Niewielki jitter zachowuje odstepy. Skaly wystepuja ~1.56x czesciej
niz przy komorkach 640 m; w promieniu 360 m jest do czterech dominant
w szczegolnie korzystnym ukladzie, uwzgledniajac ich rozmiar.
Kierunek kamery, mgla i teren moga zaslonic skaly; na stromych
obszarach moze byc ich mniej. Mniejsze skaly wystepuja tylko przy dominantach.
To rzadkie punkty orientacyjne przyciagajace wzrok, nie jednolity rozsyp.
Strome stoki i zbyt nierowne podloze sa pomijane; podstawa jest zaglebiana
wedlug wysokosci pod obrysem o 12% wysokosci modelu + 0.4 m,
aby skala wygladala na osadzona w piasku. Rozmieszczenie jest deterministyczne
i wspolne dla graczy, niezaleznie od ich lokalnej siatki chunkow.
Skaly nie maja kolizji ani wplywu na autorytatywny ruch. Na duzej skale
mozna jednak na stale osadzic jedna przygotowana szmaragdowa tablice.
Bitumen + szmaragdowa tablica tworza tablice ze spoiwem, zachowujac autora,
tresc i skreslenia. Bitumen jest drugim surowcem poczatkowym obok Sal Smaragdinum.
Z bliska **E** osadza tablice po potwierdzeniu albo otwiera juz osadzona
tablice do czytania. Nie mozna jej zabrac ani zmienic; pozostaje po restarcie.
Przy kilku przygotowanych tablicach **E** otwiera wybor tablicy przed potwierdzeniem.
Tooltip zawiera autora i fragment tresci, aby odroznic zapiski tego samego autora.
Kamien z osadzona tablica ma subtelne szmaragdowe zylki i delikatny poblask.
Pekniecia nie tworza regularnych pasow opasujacych skale.
Tablica przylega do niemal pionowej sciany okolo 2.6 m nad lokalnym piaskiem,
zamiast do spodniej czesci przewieszenia. Przy starcie serwer przelicza polozenie
takze starych inskrypcji, zachowujac kamien, autora i tresc.
Zmienia sie tylko jego wyglad, nie ksztalt ani liczba batchy renderera.
Interakcje wspoldzielace **E** wybieraja tylko dostepny cel; pobliska tablica
ma pierwszenstwo przed podnoszeniem paczki, a otwarte okna blokuja interakcje.
Nie ma globalnej listy tablic ani oznaczen na mapie.

Teren przekazuje liste do `Stone({ stones, material, shadowMaterial })`.
Wszystkie skaly jednego chunka tworza jeden renderable glowny i jeden
cieni, zamiast draw calla na kazdy kamien. Maja bounds do cullingu i
wspoldzielone programy shaderow. Zachowane chunki zachowuja kamienie;
usuwanie chunka lub rozlaczenie zwalnia modele i ich bufory GPU.
Pole `stones` jest walidowane; brak pola oznacza chunk bez kamieni
(zgodnosc z dotychczasowymi snapshotami). Brak typu/rozmiaru oznacza
erodowany glaz o wysokosci 10 m. Geometria w `src/shared/StoneGeometry.js`
jest wspolna dla renderera i serwerowego wyznaczania powierzchni pod tablice;
typy przesylane w protokole wymagaja tez aktualizacji walidacji i wyboru klasy.

### Uschniete drzewa

Serwer dodaje `trees: [{ seed, size, position: [x,y,z] }]` do kazdego chunka.
Rzadkie skupiska 3-8 drzew powstaja w stalych komorkach swiata 192 m;
stromizny sa pomijane. Pnie maja 4-9 m, sa lekko zaglebione w piasku,
pochylone i rozgalezione, bez lisci. Seed swiata ustala polozenia i ksztalty:
rozni gracze oraz rozne siatki chunkow widza te same drzewa.
`DeadTree` korzysta z cyklu zycia i batchowania `Stone`: jeden model koloru
i jeden cienia na chunk, bounds i zwalnianie GPU przy usunieciu terenu.
Shader kory uzywa oswietlenia, cieni i mgly swiata. Drzewa sa dekoracyjne,
bez kolizji ani interakcji. Stare snapshoty bez `trees` pozostaja poprawne.

### Teren, shadery i oswietlenie

Serwer steruje wspolnym cyklem dnia i nocy. Pelna doba trwa **30 minut**
(`server/src/world/day-cycle.js`); faza 0 to swit, 0.25 poludnie,
0.5 zachod, 0.75 polnoc. `state.dayCycle` zawiera `{ phase, duration }`.
Faza pochodzi z czasu serwera, wspolnego dla wszystkich graczy, nie zegara klienta.
Zegar serwera jest monotoniczny podczas pracy; po restarcie faza wynika z czasu
rzeczywistego i stalej epoki w `day-cycle.js`, wiec doba nie zaczyna sie od nowa
i biegnie rowniez bez graczy. Epoka ustawia poczatek nocy w chwili tej zmiany.
Klient interpoluje probki zegarem monotonicznym i synchronizuje sie przy kazdym
pakiecie. `DayNightCycle` aktualizuje swiatlo przed renderowaniem cieni.
Wschod i zachod maja cieple kolory; noca zmieniaja sie niebo, mgla i oswietlenie
terenu, kamieni, drzew, tablic oraz postaci. Slonce chowa sie pod horyzont,
a slabiej swiecacy ksiezyc przejmuje cienie. Noc pozostaje grywalnie widoczna.
Tor slonca i ksiezyca jest pochylony o 35 stopni od pionowej plaszczyzny;
oba osiagaja najwyzej 55 stopni nad horyzontem, a cienie podazaja za nimi.
Pylki wiatru wygasaja wraz ze swiatlem dnia, znikaja w nocy i wracaja o swicie.
Pnie i galezie suchych drzew maja wygladzone normalne bocznych powierzchni;
przekroje pozostaja plaskie, a geometria, generacja i batching nie zmieniaja sie.

Gwiazdy sa zakotwiczone w kierunkach swiata, niezaleznie od kamery, pozycji
gracza i fazy doby. Trzy warstwy proceduralnego pola gwiazd maja rozne
gestosci, rozmiary i jasnosci oraz subtelne zimne/cieple odcienie.
Najdrobniejsza warstwa jest przerzedzona. Jedna jasniejsza, nieruchoma gwiazda
wskazuje kierunek serwerowego (0, 0), a nad srodkiem jest w zenicie.
Serwer wysyla jedynie jednostkowy kierunek `state.originStar`, bez pozycji gracza.
Ta gwiazda nie migocze i ma wyrazniejsza blekitna poswiate; pozostale delikatnie
zmieniaja jasnosc w czasie, bez ruchu. Poszerzony profil Gaussa ogranicza
subpikselowe iskrzenie przy obracaniu kamery, zachowujac energie drobnych gwiazd.
Co okolo 45 sekund przez losowy fragment nieba przemyka meteor (1.3 sekundy),
widoczny tylko noca. Efekty korzystaja z monotonicznego czasu klienta.
Nie ma recznie ulozonych krzyzy ani rombow:
pozostale charakterystyczne uklady gracze odnajduja sami i ucza sie nawigacji.
Nie ma linii, podpisow ani podpowiedzi w interfejsie. Gwiazdy znikaja
stopniowo o swicie; antyaliasing ogranicza migotanie drobnych punktow.
Teren, kamienie i obaj gracze korzystaja ze wspolnego `lighting.glsl`,
dolaczanego do fragment shaderow przy ladowaniu sceny: cieple swiatlo
bezposrednie i hemisferyczne swiatlo otoczenia. Cien tlumi tylko swiatlo
sloneczne, nie ambient; postacie rowniez odbieraja cienie i mgle.
Ortogonalna mapa 2048x2048 obejmuje 280 m zamiast 800 m
(~0.137 m/texel zamiast ~0.391 m/texel), z zakresem glebi 1-1400.
To dokladne cienie pobliskiego otoczenia, nie calego horyzontu.
Wspolny filtr tent PCF (9 porownan z interpolowanymi wagami) wygladza
krawedzie. Bias jest zaleznym od nachylenia przesunieciem w jednostkach
swiata, przeliczanym przez zakres glebi; polygon offset chroni przed acne.
PCF koryguje glebie osobno w kazdym texelu wedlug plaszczyzny odbiorcy
(pochodne ekranowe GLSL), zamiast porownywac cala stroma powierzchnie
z glebia srodka fragmentu. Ogranicza to linie samocieniowania przy
krawedziach trojkatow; wspolne probki halo zachowuja zgodne normalne chunkow.
Oswietlone materialy sceny sa przy ladowaniu konwertowane do GLSL 300 ES
(`in/out`, `texture`, nazwane wyjscie fragmentu); pochodne sa wbudowane
w WebGL2. Pozostale shadery nadal uzywaja dotychczasowego formatu.
Cienie lagodnie zanikaja przy granicach mapy. Rozdzielczosc nie zostala
zwiekszona, aby ograniczyc koszt GPU przy dwoch klientach.

### Postprocesy kamery

`CameraPostProcesses` jest komponentem aktora kamery z onscreen `Renderer`.
Przyjmuje uporzadkowana liste `effects` (instancje `PostProcessMaterial`)
i `maxPixels` (domyslnie 640*360). Scena wraz z niebem i czastkami
jest renderowana do tekstury koloru z buforem glebi; efekty sa wykonywane
po kolei na pelnoekranowym quadzie, z ping-pongiem dla wielu efektow.
Ostatni efekt wyswietla obraz na canvasie. UI HTML pozostaje ostre.
Zmiana rozmiaru odtwarza targety, wylaczenie komponentu zwalnia targety,
programy i bufory. Brak komponentu pozostawia dotychczasowy rendering.

Scena wlacza umiarkowany PS1 przez `ps1.frag.glsl`: okolo 640x360
(proporcje dostosowane do okna, bez rozciagania), nearest-neighbor,
5 bitow na kanal koloru i subtelny uporzadkowany dithering Bayer 4x4.
Efekt jest stylizacja PS1, bez vertex wobble i bez zmiany symulacji.
Kolejne efekty mozna dodac tak:

```js
const ps1 = await PostProcessMaterial.fromFiles(
    './shaders/postprocess.vert.glsl', './shaders/ps1.frag.glsl');
new CameraPostProcesses({ effects: [ps1], maxPixels: 640 * 360 });
```

Fragmenty postprocesow otrzymuja `u_scene`, `u_resolution` i `v_uv`.
System nie modyfikuje mapy cieni i odtwarza stan depth/cull/blend.

## Interfejs alchemika

Okna i displayery sa adaptacja systemu z lokalnego projektu `ponyvile`,
z zachowaniem klasycznych skryptow i cyklu komponentow tego silnika.
Menu wyprawy, sterowanie i ustawienia korzystaja z zarzadzanych okien.
Styl: ciemny pergamin, mosiezne obramowania, bursztynowe akcenty i
symbole alchemiczne. HUD probek prezentuje dotychczasowa wartosc punktow;
nie dodaje jeszcze zbierania, receptur ani celu fabularnego.

### Ekwipunek

Klawisz **I** otwiera ekwipunek bezposrednio podczas gry. Ten sam input
mozna uruchomic przyciskiem z ikona torby i oznaczeniem **I** w lewym
dolnym rogu. Akcja `inventory` jest rejestrowana w `InputManager` przez
`InventoryDisplayer`; HUD i klawiatura korzystaja z tego samego handlera.
Ponowne **I**, Escape lub przycisk zamkniecia ekwipunku wracaja do gry i probuja
ponownie przejac kursor; jesli przegladarka odmowi, pokazywane jest menu.
Otwarte okno blokuje input kamery i zwalnia pointer lock, zatrzymujac ruch.
Przejscie do czytania zapisek nie wznawia gry miedzy oknami.
W menu (Esc podczas gry) przycisk **Ekwipunek** nadal otwiera liste.
Ekwipunek ma jedna wspolna liste: wlasny dziennik, cudze dzienniki,
pozostale zapiski, a na koncu surowce. Kolejnosc w grupach jest stabilna.
`InventoryItem` przyjmuje opcjonalny trzeci argument
`{ category: 'notes', author: 'Autor', authorId: 'localization.id' }`;
domyslna kategoria to `items`, a zapiski wymagaja autora.
Nowy alchemik zaczyna z wlasnym dziennikiem, jedna Sal Smaragdinum i jednym Bitumen. **Szmaragdowe Tablice**,
autorstwa anonimowego alchemika, po znalezieniu trafiaja do wspolnej listy; klikniecie
otwiera pergaminowe okno z autorskim tekstem w jezyku UI. Przedmiot nie
znika po przeczytaniu. Zamkniecie czytania przyciskiem lub Escape wraca
do ekwipunku, nie zamyka go.
Obslugiwane typy przedmiotow obejmuja **Citrine Arsenicum** i **Argentum Vivum**:
nazwy pozostaja niezmienione przy przelaczaniu jezyka. Te przykladowe
skladniki nie maja jeszcze akcji uzycia. Wszystkie przedmioty, takze zapiski
i dzienniki, sa przedstawiane samymi ikonami. Wlasny dziennik ma specjalna
zlota pieczec. Hover lub focus klawiatury pokazuje tooltip z nazwa, autorem
(dla zapisek) i opisem. Wspolny `ItemIcon` rysuje ikony w ekwipunku, slotach
i oknie wyboru. `InventoryItem` przyjmuje `icon: 'crystal' | 'vial' | 'ash'`,
`description` oraz `descriptionId`.
Okno ekwipunku ma stale 760x560 px (ograniczone rozmiarem ekranu),
z jedna przewijana siatka; liczba przedmiotow nie zmienia wymiarow.
Kolumny siatki rownomiernie wypelniaja dostepna szerokosc, takze ze scrollem.
Lista ma cienki mosiezny scroll. Oznaczenie nowosci jest nakladka,
bez zmiany rozmiaru pola. Prawy przycisk myszy na ikonie (lub klawisz
menu kontekstowego / Shift+F10) otwiera akcje przedmiotu z nazwa i autorem.
Akcja **Wyrzuc** tworzy paczke na ziemi; nie ma przyciskow pod kazda ikona.
Nie ma osobnej akcji spalania. Niewielki przycisk **Przemiany** w stopce
ekwipunku otwiera okno przemian; zamkniecie wraca do ekwipunku.
UI nie usuwa itemow przed zapisem.

#### Przemiany

Klawisz **C**, osobna ikona w HUD lub przycisk **Przemiany** w menu otwieraja
okno bez przechodzenia przez ekwipunek. `CraftingDisplayer` rejestruje
akcje `crafting` w `InputManager`, analogicznie do skrotow I i J.
Okno zachowuje ciemny pergamin i mosiezna kolorystyke reszty UI.
Krag ma delikatne kreski i romby przy naroznikach; hover zywiolu podkresla
symbol bez dodatkowego tla. Krag z dwoma polaczonymi slotami dopasowuje rozmiar do dostepnej szerokosci
i wysokosci bez przewijania okna. Klikniecie slotu otwiera `ItemPickerWindow`
z ikonami ekwipunku i tooltipami; drugi wybrany przedmiot jest wykluczony.
Klikniecie zajetego slotu od razu go oproznia, nie zmieniajac drugiego.
Tylko pusty slot otwiera wybor; okno wyboru nie ma przycisku oprozniania.
Zamkniecie wyboru nie zmienia skladnikow. Okno przedstawia symbole alchemiczne zywiolow
w cwiartkach osi Cieple-Zimne i Suche-Mokre:
ogien (cieple/suche), powietrze (cieple/mokre), ziemia (zimne/suche)
i woda (zimne/mokre). Laczymy dwa rozne przedmioty ALBO jeden
przedmiot z jednym zywiolem. Wybrany zywiol zajmuje drugi slot;
wybor drugiego przedmiotu go usuwa. Ponowne klikniecie zywiolu go odznacza.
Nie ma listy receptur ani podgladu nagrody; **Polacz** wykonuje przemiane
od razu, bez dodatkowego potwierdzenia. Po odpowiedzi serwera pokazuje
sie tylko wynik doswiadczenia, okreslony przez serwer. Wynik pojawia sie
na piec sekund jako zanikajacy popup na srodku kregu, w miejscu slotow.
Klikniecie wyniku (lub aktywacja klawiatura) zamyka go od razu.
Po jego zniknieciu sloty sa ponownie widoczne.
Zamkniecie okna zeruje skladniki, zywiol, wynik i blad. Przejscie do wyboru
przedmiotu zachowuje skladniki. Spozniona odpowiedz po zamknieciu nie przywraca wyniku.

Receptury w `server/src/crafting.js`: dziennik + ogien daje popiol,
dziennik + woda zachowuje dziennik z opisem zmokniecia i wyschniecia,
dziennik + ziemia/powietrze niczego nie zmienia. Popiol + powietrze
bezpowrotnie rozwiewa popiol. Popiol + fizyczny item `water` (Aqua)
zuzywa oba skladniki i daje `lye` (Lixivium). Popiol + zywiol wody rowniez
zuzywa popiol i daje jedna fiolke lugu. Zdobywanie Aqua w swiecie zostanie dodane pozniej;
nie jest przyznawana na start. Inne polaczenia niczego nie zuzywaja.

`salSmaragdinum` (Sal Smaragdinum) nie ma jeszcze receptury wytwarzania ani
zrodla w swiecie; jedna jest przyznawana na start bez popupu zdobycia. Polaczenie z dowolnym
trzymanym dziennikiem zuzywa oba przedmioty i tworzy `emeraldTablets`.
Tablica zachowuje autora, ID autora i wszystkie wpisy z przekresleniami,
ma nowe ID i nie jest palna ani edytowalna. Tresc jest literalnym tekstem
w szmaragdowym oknie czytania. Dawne anonimowe tablice zachowuja swoj tekst.

Serwer sprawdza przynaleznosc i rozne ID skladnikow, liczy wynik
i zapisuje zuzycie oraz nagrody atomowo. Wyniki maja nowe ID i
`isNew:true`; korzystaja ze wspolnych popupow i zapisu ekwipunku.

Akcje przedmiotu uzywaja osobnego, uniwersalnego `TextDialogWindow`.
Kontekst przyjmuje `title`/`titleId`, `text`/`textId`, `parameters`,
opcjonalne `titleParameters` oraz `buttons: [{ label, labelId, parameters,
action, close }]`. Opcjonalny `subject: { name, nameId, author }` wyroznia
nazwe przedmiotu i pokazuje autora.
Okno ma tylko przyciski z kontekstu, bez dodatkowego przycisku zamkniecia.
Tekst jest literalny lub lokalizowany; `action` moze
zwracac Promise. Przyciski sa blokowane podczas akcji, blad jest widoczny
w oknie, a sukces zamyka je (chyba ze `close:false`). Przycisk bez akcji
sluzy np. do anulowania. `MainMenuWindow.openInventoryPage(TextDialogWindow,
context)` zapewnia powrot do ekwipunku po zamknieciu.
Zagniezdzone strony korzystaja z `openPage(type, context, returnType)`;
wybor skladnika wraca do kraftowania.
Zamkniecie przemian wraca do miejsca, z ktorego otwarto okno (gry lub menu).

Uniwersalny `Tooltip.attach(element, () => [{ heading: true, text: 'Nazwa' },
{ text: 'Opis' }])` przyjmuje dowolne wiersze danych i zwraca funkcje
odpinajaca eventy. Pokazuje tekst doslownie, bez HTML, obsluguje focus
i hover, dopasowuje pozycje do ekranu i znika podczas przewijania.

#### Osobisty dziennik

Klawisz **J** lub ikonka ksiazki obok ekwipunku otwieraja dziennik
bezposrednio z gry, przez akcje `journal` w InputManager.
Ponowne J lub zamkniecie wraca do gry; jesli dziennik zostal otwarty
z ekwipunku, wraca do ekwipunku. Skrot nie przechwytuje pisania w szkicu.
Scroll dziennika i zaznaczenie tekstu korzystaja z pergaminowo-mosieznej
palety, zamiast domyslnych kolorow przegladarki.
Czytnik Szmaragdowych Tablic ma wlasny szmaragdowy motyw
(`theme: 'emerald'` w kontekscie `ItemTextWindow`), resetowany dla innych
zapisek.

Kazdy nowy alchemik zaczyna z `AlchemistJournal`, przedmiotem w sekcji
zapisek. Dziennik ma `ownerId` nadany przez serwer; `append(text)` wysyla
nowy wpis, a `strike(entryIndex, start, end)` prosi o przekreslenie fragmentu.
Nie ma API usuwania ani edycji zatwierdzonych wpisow. W UI szkic mozna
edytowac do zatwierdzenia; potem tekst jest tylko do odczytu. Zaznacz
dowolny fragment jednego wpisu i kliknij **Przekresl zaznaczenie**.
Przekreslenia zapisuja zakresy znakow, nie zmieniaja oryginalnego tekstu,
i sa laczone gdy sie nakladaja.

Ekwipunek i zatwierdzone wpisy pochodza wylacznie z serwera.
Stare dzienniki w localStorage nie sa importowane ani zaufane.
Kazde ponowne polaczenie tworzy nowego alchemika i nowy dziennik;
poprzedni dziennik pozostaje w upuszczonym ekwipunku. Znaleziony dziennik
innego alchemika mozna czytac, ale tylko jego oryginalny wlasciciel moze
dopisywac i przekreslac tekst, i to tylko gdy nadal go posiada.
Cudzy dziennik otwiera zwykly `ItemTextWindow`, bez kontrolek edytora,
z autorem, literalnym tekstem i zachowanymi przekresleniami.
Autor ma osobny wiersz; czytnik nie opisuje uprawnien do edycji.
Pisanie korzysta z jezyka swiata gry: atrament, slady wedrowki
i akcja zapisania na kartach, bez wzmianki o serwerze lub commitach.
UI czeka na potwierdzenie serwera; blad zapisu/rozlaczenie nie usuwa szkicu
ani nie udaje zatwierdzenia wpisu.

`Inventory` jest komponentem gracza, a `InventoryItem` komponentem aktora
przedmiotu. `inventory.items` zbiera komponenty z dzieci i dalszych
potomkow wlasciciela, np. z torby. Aktor bez rodzica nie nalezy do zadnego
ekwipunku. Przenoszenie polega na zmianie `itemActor.parent`; nie ma
osobnej listy, ktora trzeba aktualizowac. Zmiana rodzica, odlaczenie
lub zniszczenie aktora odswieza otwarte okno.

```js
const itemActor = new Actor('resin-sample', [new InventoryItem('item.resin')], 'item.resin');
itemActor.parent = player;
Scene.Instance.PushActor(itemActor);
const inventory = player.GetCompnentByType(Inventory);
console.log(inventory.items);
itemActor.parent = null;
```

Przedmiot uzywalny dziedziczy po `InventoryItemWithUse` i implementuje
`onUse({ inventory, windows })`. Okno wywoluje `inventory.use(item, context)`;
wywolanie sprawdza przynaleznosc przedmiotu przed wykonaniem jego akcji.
Zwykle przedmioty sa widoczne, ale nie maja aktywnego przycisku uzycia.
`EmeraldTablets` jest przykladem otwierajacym `ItemTextWindow`.

Hierarchia aktorow utrzymuje `children` i odrzuca cykle. Zniszczenie
rodzica odlacza dzieci, nie niszczy ich rekurencyjnie.
`ServerInventory` odwzorowuje snapshot serwera na te relacje. Samo lokalne
dodanie aktora nie nadaje mu wlasnosci na serwerze ani nie tworzy przedmiotu
do zapisu. `Inventory.ADDED` emituje uniwersalne powiadomienie dla kazdego
nowego komponentu w hierarchii; kolejne snapshoty tego samego ID nie
duplikuja powiadomien.
Startowe przedmioty maja `isNew:false` i nie wywoluja popupow.
Powiadomienia o zdobytych itemach sa kolejkowane, lekkie wizualnie,
wsuwaja sie z lewej i wygasaja pod koniec pieciu sekund.

Po rozlaczeniu caly ekwipunek zostaje na ziemi w paczce: ksiazka i swiecaca
kula w bialo-zlotym kolorze. Podejdz na odleglosc do 6 m i nacisnij **E**. Serwer sprawdza
odleglosc i istnienie paczki, przenosi tyle przedmiotow, ile miesci sie w torbie,
w jednej transakcji. Reszta zostaje w tej samej paczce; klient pokazuje po lewej
powiadomienia tylko o zdobytych przedmiotach.
Jednoczesnie widac do pieciu powiadomien. Kolejne pojawiaja sie z odstepem
co najmniej 350 ms i kazde znika po wlasnych pieciu sekundach;
nadmiar czeka w kolejce, takze przy jednoczesnym podniesieniu wielu przedmiotow.
Nowe przedmioty maja swiecaca ramke i oznaczenie **Nowe**; hover, focus
lub klikniecie wysyla `inventorySeen`. Stan oznaczenia zapisuje serwer.
Rozlaczenie/restart nie duplikuje przedmiotow ani nie usuwa dziennika.
`InteractionDisplayer` jest wspolna baza promptow: podklasa podaje
`ACTION`, `KEY_CODE`, `KEY_LABEL`, `LABEL_ID`, getter `target` i
`interact(target)`. Zmiana dostepnosci celu wywoluje `refresh()`.
Baza obsluguje InputManager, wyglad, widocznosc, bledy i blokade
rownoleglych akcji; `PickupDisplayer` dostarcza tylko cel i podnoszenie.

### Trwaly stan serwera

Serwer uruchamiany przez `server/src/index.js` zapisuje
`server/data/world.json` (sciezke mozna zmienic zmienna `DATA_FILE`).
Plik zawiera wersje schematu, aktualny seed swiata, spawn, ekwipunki
i pozycje aktywnych alchemikow, upuszczone paczki oraz osadzone tablice. Seed i spawn sa
zachowane po restarcie; seed jest wspolny dla heightmap, symulacji
i generatora kamieni. Nowy zapis zachowuje dotychczasowy seed 12.
`server/data/` jest ignorowane przez git. Nalezy robic kopie zapasowe
tego pliku; nie kasowac go przy wdrozeniu.

Zapis JSON jest atomowy: plik tymczasowy, zapis, a potem podmiana pliku
docelowego. Transakcja zmienia stan w pamieci dopiero po udanym zapisie,
a odpowiedz sukcesu jest wysylana po zatwierdzeniu. Uszkodzony plik
przerywa start zamiast tworzyc pusty swiat. Testowe `createSocketServer`
moze korzystac z pamieci; normalny entrypoint zawsze wlacza zapis.

Rozlaczenie i zamkniecie serwera przenosza caly ekwipunek do jednej paczki.
Przy odtworzeniu po awarii zapisane aktywne ekwipunki sa jednorazowo
zamieniane na paczki w ostatniej zapisanej pozycji. Jeden przedmiot ma
jedno ID i jednego posiadacza; dwoch graczy nie moze podniesc tej samej
paczki. Swiat nie tworzy automatycznie przykadowych paczek skladnikow:
nowy gracz otrzymuje swoj dziennik, Sal Smaragdinum i Bitumen.

Przy korzeniach wybranych suchych drzew leza bursztynowe grudki zywicy.
Miejsca wynikaja z seeda i generatora drzew, nie sa rozkladane rownomiernie
ani oznaczane na mapie. Nie maja swietlnego znacznika paczek.
`state.drops` oznacza je przez `kind: 'resin'`; akcja E korzysta z istniejacego
`pickup`. Serwer sprawdza miejsce, dystans 6 m i pojemnosc ekwipunku.
Zebranie przyznaje jeden przedmiot i atomowo zapisuje ID w `harvestedResin`;
miejsce pozostaje puste dla wszystkich, rowniez po restarcie.
Starsze zapisy bez tego pola sa odczytywane jako swiat bez zebranej zywicy.
Receptury pozostaja po stronie serwera: zywica na powietrzu twardnieje,
a ogien zmienia swieza lub stwardniala zywice w Bitumen, przydatny do tablic.
Opisy przedmiotow nie zdradzaja receptur. Nie dodano zywicy do startowej torby.

Zywica i lug tworza miksture raczego kroku; potraktowanie mikstury ogniem daje
esencje. Oba przedmioty mozna wypic kliknieciem w ekwipunku. `drink { itemId,
requestId }` zuzywa wlasny przedmiot dopiero po atomowym zapisie. Serwer,
nie klient, nadaje efekt: mikstura +25% predkosci przez 5 minut wedlug zegara
monotonicznego, kolejna odswieza czas bez kumulacji. Esencja daje +10% tylko
raz na alchemika; kolejna proba nie zuzywa fiolki. Razem efekty daja +35%.
Nie zmieniaja wysokosci skoku. Efekty istnieja tylko do rozlaczenia:
alchemik nigdy nie ma trwalej tozsamosci, a restart rowniez konczy jego zycie.
Niewypite fiolki zachowuja sie jak inne przedmioty: moga byc przekazywane,
upuszczane i odzyskiwane z paczek. Receptury nie sa ujawniane w interfejsie.

Komendy: `pickup { dropId }`, `inventorySeen { itemId }`,
`inventoryDrop { itemId, requestId }`, `craft { itemIds, element, requestId }`,
`journalAppend { itemId, text, requestId }`,
`journalStrike { itemId, entryIndex, start, end, requestId }`,
`placeInscription { itemId, stoneId, requestId }`,
`readInscription { stoneId, requestId }`.
`inventory` zwraca snapshot, `operationResult` potwierdza zapis dziennika,
wyrzucenie lub przemiane (w `result`: `outcome`, `consumedIds`, `producedItems`),
a `state.drops` podaje wylacznie pozycje wzgledem odbiorcy.
`state.stoneSites` zawiera identyfikatory kamieni, relatywne pozycje i normalne
powierzchni oraz informacje o zajetym miejscu, bez tresci i autora.
Odczyt osadzonej tablicy zwraca przedmiot w `operationResult.result`, nie dodajac go do ekwipunku.
Klient nie przesyla pozycji ani calego ekwipunku do zapisu.

Serwer sprawdza wlasnosc przedmiotow i autora dziennika na podstawie
polaczenia, nie z przeslanego ownerId. Wpisy maja limit 4000 znakow,
dziennik 200 wpisow, ekwipunek 32 przedmioty bez stackowania; ograniczone sa rozmiary
wiadomosci i czestotliwosc operacji. Niedozwolone znaki kontrolne sa
odrzucane. Tekst jest danymi JSON i jest renderowany przez `textContent`,
nigdy `innerHTML`, `eval` ani zapytania SQL. Znaczniki HTML widoczne
w tekscie dziennika pozostaja literalnym tekstem. To prototyp bez kont:
nowe polaczenie oznacza nowego alchemika, nie odzyskanie starej tozsamosci.

## Game i managery

`Game`, `LocalizationManager`, `ObjectManager`, `ResourceManager` i
`SaveManager` sa adaptacja klas z lokalnego projektu `ponyvile`.
`Game.Instance.initialize()` jest idempotentne i zwraca wspolna obietnice:
czeka na lokalizacje i manifest zasobow, potem inicjalizuje globalne
obiekty oraz osobny zbior lokalnych obiektow zapisu. `GameInterface.boot`
czeka tez na gotowosc shaderow przed `Scene.Start()`. Bledy HTTP/JSON
i walidacji przerywaja start i sa widoczne w UI, zamiast udawac sukces.
`Scene` nadal jest wlascicielem aktorow swiata multiplayer;
`Game.Instance.ObjectManager` sluzy niezaleznym globalnym obiektom klienta.
`push/remove/getByIdentifier` i `actors` zachowuja cykl komponentow;
`Actor.destroy()` usuwa obiekt z managera, ktory go posiada.

### Lokalizacja

Plik `client/src/game/resources/localization/localization.json` ma format
tablicy wierszy: `["id", "pl", "en"]`, potem `[id, tekstPL, tekstEN]`.
UI, tytul strony, statusy polaczenia i displayery korzystaja z tych ID.
Jezyk mozna zmienic w ustawieniach lub:

```js
const localization = Game.Instance.LocalizationManager;
localization.setLanguage('en');
localization.get('settings.server', { distance: 6 });
localization.localize(element, 'settings.server', { distance: 6 });
```

Wybor jest zapisany pod `great-name.language`; przy pierwszym uruchomieniu
uzywany jest obslugiwany jezyk przegladarki, potem pierwszy jezyk tabeli.
`data-localization-id` i `data-localization-parameters` utrzymuja tekst
przy zmianach jezyka; parametry maja postac `@name`.
`refresh(root)` obejmuje tez sam root, `unlocalize` usuwa powiazanie.
Tekst jest ustawiany przez `textContent`, bez interpretacji HTML.
Nieobslugiwany jezyk lub brak ID sa jawnie raportowane.

### Zasoby JSON

`ResourceManager` laduje `client/src/game/resources/data/DataContainers.json`:
katalog `{ resourceID: data }` z definicjami wszystkich rodzajow przedmiotow.
Nadal obsluguje liste sciezek do dodatkowych plikow wzgledem manifestu.
Kazdy zasob wymaga `type`; przedmioty maja `type: 'inventoryItem'`,
`category`, `nameId`, `descriptionId`, unikalny `icon` (sciezka SVG),
`iconColor` (kolor hex) oraz `serverType` zgodny z typem przedmiotu na serwerze.
Klucze sa komponowane: `item.resin`, `item.hardened-resin`, `item.speed-potion`.
Opcjonalne `authorId`, `ownIcon` i `ownDescriptionId` definiuja domyslnego
autora tablic i wyroznienie dziennika wlasciciela. ID tekstow wskazuja
wiersze lokalizacji PL/EN; kod komponentow nie przechowuje nazw, opisow ani ikon.
Dane sa klonowane, walidowane i rekurencyjnie zamrazane. Nieznany zasob,
brak metadanych, niedozwolona sciezka SVG lub powtorzona ikona sa bledem.
API: `register`, `get`, `has`, `getAllByType`.

`Actor.ResourceID` jest ID rodzaju (np. `item.speed-potion`), nie UUID egzemplarza.
Trzeci argument konstruktora `Actor` moze go ustawic; `InventoryItem` uzupelnia
go przy inicjalizacji lokalnych aktorow i odrzuca sprzeczne ID.
Metadane `InventoryItem.resource` pochodza z zasobu wskazanego przez aktora.
`ServerInventory` mapuje serwerowy `type` przez `serverType` na `ResourceID`, a serwerowe UUID
pozostaje w `serverId`. Dziennik, tablice i mikstury zachowuja wyspecjalizowane
zachowanie, ale wyglad pobieraja z tego samego katalogu.
`ItemIcon` renderuje sciezke z zasobu, bez wyboru ikony po typie w kodzie;
kazdy rodzaj ma inny wzor i moze miec inny kolor, a wlasny dziennik dodatkowa pieczec.

Ekwipunek ma 32 osobne miejsca; niezajete miejsca sa widoczne jako puste sloty,
bez licznika. Podnoszenie przenosi pierwsze przedmioty mieszczace sie w torbie,
a reszta zachowuje ID paczki i pozycje na ziemi. Pelna torba jawnie odrzuca probe.
Zbieranie surowcow i wyniki przemian respektuja ten sam limit na serwerze.
Starsze wieksze paczki tez mozna podnosic czesciowo, bez dzielenia ich przy starcie.

Ruch myszy jest sumowany pomiedzy klatkami, a nie nadpisywany ostatnim zdarzeniem.
Kamera wygladza kat orbity najkrotsza droga oraz jej promien osobno:
gwaltowny obrot nie przecina juz srodka gracza i nie odwraca nagle kierunku patrzenia.

### Sekwencje ActionGraph

`ActionGraph` dziedziczy po `Actor` i przechowuje uporzadkowana liste `actions`.
Silnik wykonuje tylko jedna akcje naraz: opcjonalne `start(context, runner)`,
`update(dt, context, runner)` zwracajace `true` po zakonczeniu oraz opcjonalne
`stop(context, runner)`. Graf ma stany `idle`, `running`, `completed`, `cancelled`
i `failed`; bledy zatrzymuja sekwencje i sa jawnie raportowane.

Gotowe akcje: `WaitForEventAction`, `MoveCameraAction`, `MoveCharacterAction`,
`SpawnObjectAction`, `ShowTextAction`, `FadeAction`. Zdarzenia podane w konstruktorze
sa buforowane od wlaczenia grafu, wiec pozniejsze akcje ich nie gubia.
`signal(name, detail)` pozwala dostarczyc zdarzenie bez DOM, a `cancel()` usuwa
nasluchy, zadanie odswiezania i wywoluje sprzatanie kontekstu.

```js
const graph = new ActionGraph('scene', [
    new WaitForEventAction('scene-started', (detail, context) => context.prepare(detail)),
    new MoveCameraAction(4, context => context.cameraPose()),
    new MoveCharacterAction(7, context => context.direction),
    new SpawnObjectAction(context => context.createActor())
], cinematicContext, ['scene-started']);
Scene.Instance.PushActor(graph);
```

Kontekst kamery dostarcza transformacje kamery, cel `lookTarget`, renderer,
kontroler kolizji kamery i `reference()` (punkt odniesienia przesuwany razem
z terenem). Akcja ruchu postaci ustawia kierunek awatara i utrzymuje ujecie;
rzeczywisty marsz w sieci wykonuje serwer, nie lokalna zmiana pozycji.
Akcje czasowe moga uzywac `timelineStart` i `context.timeline()` do nadrobienia
czasu po uspieniu karty.

`DepartureCutscene` jest pierwszym takim aktorem. Po osadzeniu tablicy z wlasnego
dziennika odejscie o 18 m uruchamia final: kamera przez 4 s przechodzi przed
gracza, nisko po jego lewej, lecac lukiem do punktu wyliczonego z aktualnej
predkosci. Serwer od poczatku wymusza prosty marsz bez pauzy i bez zmiany
zwyklej predkosci (wraz z dzialaniem mikstur); po 11 s postac jest juz poza kadrem.
Po dolocie kamera i jej cel pozostaja nieruchome wzgledem swiata, nie sledza postaci.
Nastepuja napis PL/EN, wygaszenie, ponowne ujecie kamienia oraz lot szalika.
Napis jest widoczny przez 7 s przed 2-sekundowym wygaszeniem. Szalik faluje
w locie, hamuje przy ziemi i przez koncowe 1.4 s wygasza ruch materialu,
konczac w tej samej pozie co trwaly obiekt przy kamieniu.
Na czas sceny HUD i sterowanie sa wylaczone. Tablica, szalik i cala reszta
ekwipunku pozostaja w swiecie; alchemik konczy podroz. Menu oferuje nowa
podroz, ktora laduje nowego alchemika zamiast przywracac poprzedniego.
Rozlaczenie przerywa wizualizacje, ale nie cofa zapisanego finalu.

### Animacja modelu

`WandererAnimation` jest wizualnym komponentem lokalnego awatara i pozostalych
graczy. Udostepnia dwa wektory w osiach swiata: `movementDirection` (poziomy
ruch z natezeniem 0..1, skladowa Y to pionowa predkosc / 13 ograniczona do -1..1)
i `windDirection` (kierunek i sila wiatru).
Ruch jest mierzony wzgledem przesuwanego terenu; teleport i zmiana rewizji
swiata resetuja pomiar. `time` jest faza falowania i naprzemiennego kroku.
`airborne` jest wygladzona wysokoscia nad trojkatami otrzymanego terenu;
brak zaladowanego fragmentu nie oznacza skoku.

`WandererMaterial` przekazuje te dane do `wanderer.vert.glsl`, ktory uklada
plaszcz i porusza szpiczastymi nogami bez IK ani symulacji tkaniny na CPU.
Ten sam shader deformuje obraz i cien, a statyczna siatka jest wspoldzielona
przez awatary. Normalne sa usredniane we wspolnych wierzcholkach, osobno dla
zewnetrznej i wewnetrznej strony tkaniny. Szata jest waska u szyi i szeroka
przy ziemi, ze zlotym obszyciem. Szalik jest wstega zakotwiczona przy kolnierzu:
wektory wyginaja jej przebieg, a sinusy unosza i faluja wolny koniec bez
dodatkowego aktora ani solvera. Szpic kaptura jest lekko zalamany w dol
i na bok oraz reaguje na wiatr. Szalik przy szyi ma waskie zlote obszycia
obu krawedzi, pozostajace przy kolnierzu podczas animacji wolnego konca.
Kaptur jest pomniejszony o 10% wokol mocowania nad szyja. Kolnierz i nasada
wolnego szalika maja identyczna szerokosc 0.34 oraz wspolny uklad zlotych pasow.
Podczas wznoszenia i spadania szata sie unosi, a nogi zginaja sie w kolanach;
po ladowaniu poza plynnie wraca do spoczynku.
Kaptur ma zaglebiony pusty otwor zamiast twarzy; postac nie ma rak ani butow.
Mocowanie szalika jest po prawej stronie kolnierza (lokalne X = 0.36, Y = 2.56), a dol szaty
ma przednie rozciecie. Kaptur ma profilowany brzeg i spojna orientacje
trojkatow na calej powierzchni szpica. Ceglasty material, szalik i obszycia
zachowuja dominujaca brazowa baze po przemianie wlasnego dziennika:
tablice dodaja szmaragdowy odcien (42% tkanina, 25% obszycia), a ogien
osmala braz (45% przyciemnienia tkaniny, 30% obszyc), zamiast barwic go
na pelna czern. Bitumen nie zmienia koloru.
Obie przemiany sa trwale dla danego alchemika; cudzy dziennik nie zmienia wygladu.
Pierwsze 12% dlugosci szalika jest sztywno przymocowane do szyi.
Falowanie, wiatr i pionowe opoznienie narastaja dopiero na swobodnej czesci,
do 45% dlugosci; mocowanie porusza sie tylko razem z tulowiem.
Podczas biegu sila falowania maleje do 35%; pionowe opoznienie jest ograniczone,
aby swobodny koniec nie bujal sie nadmiernie.
`scarfVerticalMotion` wygladza pionowa predkosc wolniej niz wektor ruchu:
koniec szalika pozostaje w tyle przy wznoszeniu i spadaniu, niezaleznie od
sinusoidalnego falowania i pionowej skladowej wiatru. Shader pochyla sylwetke
w kierunku poziomego ruchu, pozostawiajac czubki nog na ziemi.
Animacja nie zmienia ruchu, zasiegu interakcji ani kolizji serwera.

### Lokalny zapis

`Game.Instance.SaveManager` zachowuje API `registerPrefab`,
`registerComponent`, `snapshot`, `validate`, `save`, `load` i
`restoreRequested`, oraz pole `variables`. Zapis jest wersjonowany
i przechowywany w localStorage; zadanie odtworzenia po przeladowaniu
strony jest przechowywane w sessionStorage.
`LocalObjects` to osobny manager dla jawnie zarejestrowanych lokalnych
aktorow. Prefaby odtwarzaja zachowanie, kodeki zapis i odczyt komponentow.
Wbudowany kodek `Transform` uzywa wektorow 3D position/rotation/scale;
komponenty innych gier wymagaja wlasnych kodekow.

Zapis nie obejmuje `Scene.Instance.actors` ani globalnych aktorow Game.
Pozycje graczy, teren i inni gracze nigdy nie sa odtwarzani z localStorage.
Nie przeniesiono kodekow walki, dialogow i fizyki 2D z `ponyvile`.
Obecna gra nie rejestruje jeszcze lokalnych prefabow i nie dodaje
przyciskow zapisu do UI. Fabryki i kodeki przyszlych lokalnych obiektow
nalezy zarejestrowac przed wywolaniem boot, aby moc odtworzyc snapshot.

```js
const saves = Game.Instance.SaveManager;
const createMarker = (id, prefab) => {
    const actor = new Actor(id, [new Transform()]);
    actor.prefab = prefab;
    return actor;
};
saves.registerPrefab('local-marker', createMarker);
saves.registerObject(createMarker('local_marker', { type: 'local-marker' }));
saves.variables = { theme: 'dark' };
saves.save();
// saves.load(); // waliduje, zada odtworzenia i przeladowuje strone
```

Fabryki zwracaja nowe, niezarejestrowane aktory. Wlasne kodeki maja postac
`registerComponent(type, { write, valid, read })`.

### Ladowanie shaderow

Shadery uzywane przez scene sa w `client/shaders/*.vert.glsl` i
`*.frag.glsl`, zamiast w `PlayableScene.js`. Material mozna utworzyc przez:

```js
const material = await Material.fromFiles('./shaders/shadow.vert.glsl',
    './shaders/shadow.frag.glsl');
const [vertex, fragment, lighting] = await Promise.all([
    Material.loadShader('./shaders/terrain.vert.glsl'),
    Material.loadShader('./shaders/terrain.frag.glsl'),
    Material.loadShader('./shaders/lighting.glsl')
]);
const vertex300 = '#version 300 es\n' +
    vertex.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, 'out');
const fragment300 = (
    `#version 300 es\nprecision highp float;\nout vec4 fragmentColor;\n${lighting}\n${fragment}`
).replace(/\bvarying\b/g, 'in').replace(/\btexture2D\b/g, 'texture')
    .replace(/\bgl_FragColor\b/g, 'fragmentColor');
const terrain = new BiomeMaterial(vertex300, fragment300, [shadowTexture]);
```

Metoda dziala takze dla klas pochodnych, pobiera pare rownolegle i
wspoldzieli cache zrodel (nie instancji materialow). Konstruktor ze stringami
nadal dziala, np. dla ParticleMaterial. Nie migrujemy skryptow do ES modules.
Scena startuje dopiero po pobraniu shaderow; przy bledzie HTTP, pustym
pliku lub bledzie startu konsola i status strony pokazuja blad, a Graj
pozostaje wylaczone. Nie ma zastepczego materialu maskujacego blad.

Stylistyka to ciepla pustynna paleta: solid colory na terenie, ciemniejsze
stoki, bursztynowa mgla i proste niebo z blaskiem slonca. Jest to wizualna
interpretacja istniejacej mapy; serwer nadal generuje te same wysokosci
i biomy. Nie uzywamy postaci ani zasobow z Journey.
Wedrowiec ma jedna niskopoligonowa siatke i rzuca cien. Niebo nie wykonuje
kosztownych petli proceduralnych chmur.
Teren nie pobiera tekstur koloru: laczy odcienie piasku i skal wedlug
nachylenia, wysokosci i wag biomow, z delikatnym dwuskalowym szumem.
Wspolrzedne szumu sa stale dla chunkow podczas ruchu i streamingu, wspolne
na ich granicach. Jedyny sampler terenu to generowana mapa glebokosci cieni.

Chunki terenu uzywaja indeksowanych siatek: 1089 wspoldzielonych wierzcholkow
zamiast 6144 kopii na chunk, przy tych samych trojkatach i wysokosciach.
Renderer pomija chunki poza bryla widzenia kamery lub kamery cieni.
Programy shaderow sa wspoldzielone w obrebie kontekstu WebGL; kazdy material
zachowuje wlasne bufory i zwalnia swoj udzial w programie podczas usuwania.
Mapa cieni jest tworzona raz, nie przy kazdym nowym materiale terenu.
Przed renderowaniem cieni jest odpinana od samplerow, aby uniknac feedback loop.
Stale dane geometrii nie sa ponownie wysylane do GPU w kazdej klatce.

Kamera cieni uzywa `cacheStatic: true`: przelicza mape przy zmianie geometrii,
transformacji, listy obiektow lub macierzy kamery. Dla innych render targetow
cache jest domyslnie wylaczony (np. dla animowanych shaderow).
Obraz 3D ma maksymalnie 1 049 088 pikseli na klienta. Wieksze widoki sa
skalowane z zachowaniem proporcji, mniejsze zachowuja natywna rozdzielczosc.
To ogranicza obciazenie wspolnego GPU przy testach dwoch klientow na duzych
monitorach. CSS i interfejs pozostaja w pelnym rozmiarze okna, niezaleznie
od rozdzielczosci renderowania. Obraz 3D moze byc mniej ostry.
Mapa cieni 2048x2048 i szczegolowosc geometrii terenu sa zachowane.

## Uruchamianie

Wymagany Node.js 18 lub nowszy oraz npm.

```sh
npm install
npm run dev
```

Strona: http://127.0.0.1:5173

WebSocket: ws://127.0.0.1:3001/socket

Osobne uruchamianie z katalogu glownego:

```sh
npm run dev:client
npm run dev:server
```

`npm start` uruchamia obie czesci bez obserwowania zmian kodu serwera.
Klient pozostaje statyczna strona; nie wymaga bundlowania.
Na Windows, jezeli PowerShell blokuje `npm.ps1`, uzyj `npm.cmd`.

## Konfiguracja polaczenia

Domyslnie klient uzywa hosta otwartej strony, portu `3001` i sciezki
`/socket` (`ws` dla HTTP, `wss` dla HTTPS).
Inny adres ustaw w `client/index.html`:

```html
<meta name="socket-url" content="wss://example.com/socket">
```

Serwer obsluguje zmienne srodowiskowe `HOST` (domyslnie `127.0.0.1`)
i `PORT` (domyslnie `3001`). Po zmianie portu dostosuj tez adres klienta.
Dla dostepu z innego komputera ustaw `HOST=0.0.0.0` oraz udostepnij strone
przez osobny serwer statyczny. Wdrozenie HTTPS wymaga reverse proxy z TLS
i obsluga WebSocket; serwer Node.js sam nie konfiguruje certyfikatow.

## Testy

```sh
npm test
```

Testy sprawdzaja adres polaczenia klienta, raportowanie bledow,
ponowne laczenie i zamykanie polaczenia oraz rzeczywiste polaczenia
WebSocket z serwerem.
Obejmuja tez generacje mapy, zgodnosc granic chunkow, walidacje danych
i budowanie siatki z otrzymanych wysokosci. Testy ruchu sprawdzaja
limit predkosci (takze na przekatnej), odrzucanie teleportacji/predkosci
i czasu klienta, wygasanie sterowania, streaming i widocznosc innych graczy.

## Komendy WebSocket

Wiadomosci sa tekstowym JSON-em z polem `command`.
Po otwarciu polaczenia klient automatycznie wysyla:

```json
{"command":"register"}
```

Serwer nadaje UUID v4 i odpowiada:

```json
{"command":"registered","playerId":"ac7700f7-2e7a-4dab-85b2-93cc879d8367"}
```

ID klienta jest dostepne jako `window.GameConnection.playerId` (`null`
przed rejestracja i po rozlaczeniu). Serwer przechowuje aktywnych graczy
w `server.players` (mapa ID na `{ id, socket, position: { x, y, z } }`), przygotowana pod przyszla
symulacje. ID jest nadawane wylacznie przez serwer, nie przez klienta.
Ponowna komenda `register` na tym samym polaczeniu zwraca to samo ID.
Rozlaczenie usuwa gracza z mapy; nowe polaczenie otrzymuje nowe ID.
Nie jest to logowanie ani trwala tozsamosc konta.

Po rejestracji klient automatycznie wysyla:

```json
{"command":"getWorld"}
```

Serwer generuje teren w jednym watku roboczym (zadania graczy sa kolejkowane),
bez blokowania petli WebSocket, i zwraca `command: "world"`:

- `chunkSize: 64`, `step: 2`, `radius: 6`;
- `chunks`: 169 chunkow otaczajacych gracza we wszystkich kierunkach;
- kazdy chunk zawiera `x`, `z` (lokalne indeksy od -6 do 6),
  `heightMap`, `biomeWeights` i liste `stones`;
- `revision`: numer snapshotu; `terrainOffset`: przesuniecie jego lokalnego
  poczatku wzgledem aktualnej pozycji gracza;
- pozycja renderowanego chunka to `[x * chunkSize, 0, z * chunkSize]`
  plus `terrainOffset`;
- `heightMap` to macierz `[x][z]` 35x35. Probki co 2 jednostki;
  jej indeksy 1..33 obejmuja chunk, a 0 i 34 sa marginesem do normalnych;
- wysokosci sa wzgledem wysokosci gracza przy pierwszym snapshotcie polaczenia,
  nie absolutnego poziomu swiata;
- `biomeWeights` to macierz 33x33, kazda probka zawiera 4 wagi tekstur:
  snieg, piasek, chwasty, trawa.

Snapshot jest dostepny jako `window.GameConnection.world` i emituje
`worldreceived` z danymi w `event.detail`. Klient sprawdza ksztalt danych,
buduje trojkaty i normalne (bez proceduralnej generacji mapy) oraz dodaje
po 2 chunki na aktualizacje sceny, zaczynajac od najblizszych.
`worldcleared` usuwa poprzednia scene terenu przy rozlaczeniu.
Odleglosc rysowania ustala obecnie serwer; suwak klienta jest wylaczony.
Kolejne `getWorld` podczas trwajacego generowania nie dodaje nowego zadania.
Po zakonczeniu zwraca zapisany snapshot (najwyzej raz na sekunde, z kontrola
kolejki wysylania). Klient nie moze wybrac pozycji swiata przez te komende.

Po przemieszczeniu o 64 jednostki od poczatku snapshotu serwer przesuwa
okno widocznosci o calkowita liczbe chunkow, zachowujac siatke probkowania
i poczatkowy poziom odniesienia wysokosci. Generuje tylko brakujace chunki
i wysyla `command: "worldDelta"`:

- `baseRevision`: rewizja, do ktorej nalezy zastosowac aktualizacje;
- `revision`: kolejna rewizja;
- `chunkShift: [dx, dz]`: przesuniecie okna w jednostkach chunkow;
- `chunkSize`, `step`, `radius`, `terrainOffset`: jak w `world`;
- `chunks`: tylko nowe chunki, indeksowane w nowym lokalnym oknie.

Klient przesuwa indeksy zachowanych chunkow o `[-dx, -dz]`, usuwa te poza
zakresem -6..6, dodaje nowe i waliduje kompletne okno przed przyjeciem danych.
`GameConnection.world` nadal udostepnia kompletne 169 chunkow do kamery.
Istniejace siatki, bufory GPU i materialy nie sa przebudowywane; zmienia sie
tylko ich transformacja. Przesuniecie rodzica kompensuje przesuniecie chunkow,
zachowujac polozenie terenu i plynne przesuwanie pomiedzy stanami serwera.
Przejscie o jeden chunk na jednej osi wymienia 13 chunkow, na przekatnej 25.
Oczekujace, jeszcze nie zbudowane chunki sa dopasowywane do nowego okna.

Pelny snapshot jest potrzebny przy pierwszym polaczeniu (lub ponownym
`getWorld`); chodzenie uzywa aktualizacji roznicowych. Ruch nie moze przekroczyc
128 jednostek od aktualnego poczatku okna, aby nie wyjsc poza teren podczas
generacji. Pierwszy JSON nadal ma kilka MB; format binarny i LOD pozostaja
do dalszych etapow.

### Ruch i gracze

Klient przesyla intencje, nie pozycje, predkosc ani czas symulacji:

```json
{"command":"move","forward":1,"right":0,"yaw":45}
```

`forward`/`right` sa w zakresie [-1, 1], `yaw` w stopniach [-180, 180].
Dodatkowe pola (np. `position`, `speed`, `playerId`, `deltaTime`) sa odrzucane.
Komenda jest przypisana do gracza polaczenia, nie ID podanego przez klienta.
Klient odnawia sterowanie co 100 ms; utrata focusu lub pointer lock wysyla
zerowy kierunek. Po 500 ms bez komendy serwer zatrzymuje ruch poziomy;
grawitacja i ladowanie nadal sa symulowane.

```json
{"command":"jump"}
```

Skok nie przyjmuje dodatkowych pol. Wymaga rejestracji i gotowego terenu;
serwer nadaje impuls `sqrt(2 * 20 * 2)` przy grawitacji 20 jednostek/s².
Przy braku podloza i przy spamie nie daje dodatkowych impulsow w powietrzu.
Klient nie wysyla predkosci pionowej ani wysokosci i nie przewiduje pozycji.

Serwer symuluje i publikuje stan 20 razy na sekunde. Predkosc to maksymalnie
13 jednostek/s, bez przyspieszenia na przekatnej. Wiele komend w jednym
kroku tylko nadpisuje intencje i nie dodaje kolejnych przemieszczen.
Czas pochodzi z monotonicznego zegara serwera; krok jest ograniczony
do 100 ms podczas opoznienia petli.

```json
{
  "command":"state",
  "revision":1,
  "terrainOffset":[-3,0,-8],
  "players":[
    {"id":"e792aebc-3236-4d29-8b4b-0796a7ea0740","position":[8,0,12]}
  ]
}
```

Pozycje innych graczy sa wzgledem odbiorcy. Lista zawiera tylko innych
graczy z gotowym terenem, do odleglosci 384 jednostek. Brak gracza na nowej
liscie usuwa jego model i cien, takze po rozlaczeniu. Stan jest dostepny przez
`window.GameConnection.state` i zdarzenie `networkstate`.
Klient stosuje tylko stany pasujace do aktualnego `revision`.
Absolutne wspolrzedne nadal nie sa wysylane.

To zabezpiecza stan serwera przed teleportacja i zmiana predkosci przez
komendy klienta; nie jest pelnym systemem anti-cheat ani uwierzytelnianiem kont.

Bledne wiadomosci otrzymuja odpowiedz:

```json
{"command":"error","code":"UNKNOWN_COMMAND","message":"Unknown command."}
```

Kody bledow: `INVALID_MESSAGE` (wiadomosc binarna), `INVALID_JSON`,
`INVALID_COMMAND` (brak tekstowego pola `command`), `UNKNOWN_COMMAND`,
`NOT_REGISTERED`, `WORLD_GENERATION_FAILED`, `WORLD_RATE_LIMIT`,
`INVALID_MOVEMENT`, `WORLD_NOT_READY`.
Bledy sa raportowane w konsoli; nie zamykaja polaczenia.

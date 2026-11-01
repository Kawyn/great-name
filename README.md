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
Kostki do zbierania pozostaja wylaczone.
Wlasny gracz i inni pobliscy gracze maja wspolny, autorski model wedrowca:
geometryczna peleryne, kaptur i zloty szal. Kontroler `CameraController`
obsluguje wylacznie TPP; inne typy kamer wymagaja osobnego kontrolera.
Kamera krazy wokol glowy (wysokosc 3.3 jednostki).
Dystans zalezy plynnie od nachylenia: 1 jednostka
przy -85 stopniach, 24 przy poziomym widoku, 26 przy 60 stopniach i wyzej.
Mysz obraca ja wokol gracza, WASD dziala wzgledem
kamery. Postac obraca sie w kierunku ruchu, nie podczas samego obrotu kamery.
Pozycja i obrot kamery sa wygladzane wykladniczym lerpem zaleznym od czasu,
nie liczby klatek. Zakres pionowy wynosi od -85 do 80 stopni.
Przy patrzeniu w gore kamera zbliza sie do glowy i utrzymuje ja w centrum widoku.
Kamera unosi sie ponad otrzymana height mape, takze podczas lerpowania;
kolizja z terenem ma pierwszenstwo przed wygladzaniem.
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
Material dodaje mineralne pasma, jasniejsze zyly, drobne przebarwienia
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
Na razie sa dekoracja, bez kolizji i wplywu na autorytatywny ruch.

Teren przekazuje liste do `Stone({ stones, material, shadowMaterial })`.
Wszystkie skaly jednego chunka tworza jeden renderable glowny i jeden
cieni, zamiast draw calla na kazdy kamien. Maja bounds do cullingu i
wspoldzielone programy shaderow. Zachowane chunki zachowuja kamienie;
usuwanie chunka lub rozlaczenie zwalnia modele i ich bufory GPU.
Pole `stones` jest walidowane; brak pola oznacza chunk bez kamieni
(zgodnosc z dotychczasowymi snapshotami). Brak typu/rozmiaru oznacza
erodowany glaz o wysokosci 10 m. Nowy typ rozszerza `Stone` przez `profile(random)`;
typy przesylane w protokole wymagaja tez aktualizacji walidacji i wyboru klasy.

### Teren, shadery i oswietlenie

Slonce ma staly kierunek, bez przypadkowej animacji dobowej co klatke.
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
Ekwipunek ma dwie sekcje: **Zapiski** (nazwa i autor) oraz **Przedmioty**.
`InventoryItem` przyjmuje opcjonalny trzeci argument
`{ category: 'notes', author: 'Autor', authorId: 'localization.id' }`;
domyslna kategoria to `items`, a zapiski wymagaja autora.
Testowe **Szmaragdowe Tablice**, autorstwa anonimowego alchemika,
sa od poczatku dzieckiem gracza; klikniecie
otwiera pergaminowe okno z autorskim tekstem w jezyku UI. Przedmiot nie
znika po przeczytaniu. Zamkniecie czytania przyciskiem lub Escape wraca
do ekwipunku, nie zamyka go.
Sekcja przedmiotow zawiera tez **Citrine Arsenicum** i **Argentum Vivum**:
nazwy pozostaja niezmienione przy przelaczaniu jezyka. Te przykladowe
skladniki nie maja jeszcze akcji uzycia. Nie uzywalne przedmioty sa
przedstawiane ikonami; hover lub focus klawiatury pokazuje tooltip z nazwa
i opisem. `InventoryItem` przyjmuje `icon: 'crystal' | 'vial'`,
`description` oraz `descriptionId`.
Okno ekwipunku ma stale 760x560 px (ograniczone rozmiarem ekranu),
z niezaleznym przewijaniem list; liczba przedmiotow nie zmienia wymiarow.

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

Kazdy lokalny alchemik zaczyna z `AlchemistJournal`, przedmiotem w sekcji
zapisek. Dziennik ma `ownerId`; `append(text, ownerId)` dopisuje wpis,
a `strike(entryIndex, start, end, ownerId)` trwale przekresla fragment.
Nie ma API usuwania ani edycji zatwierdzonych wpisow. W UI szkic mozna
edytowac do zatwierdzenia; potem tekst jest tylko do odczytu. Zaznacz
dowolny fragment jednego wpisu i kliknij **Przekresl zaznaczenie**.
Przekreslenia zapisuja zakresy znakow, nie zmieniaja oryginalnego tekstu,
i sa laczone gdy sie nakladaja.

Na razie lokalny alchemik ma identyfikator `local-alchemist`, niezalezny
od chwilowego UUID socketa. Dane sa wersjonowane w localStorage pod
`great-name.journal.<ownerId>` i przezywaja odswiezenie. Zapis odbywa sie
przed zmiana stanu; blad storage jest widoczny, szkic nie znika.
To nie jest ochrona przed edycja localStorage przez gracza. W przyszlosci
serwer bedzie nadawal trwala tozsamosc i kontrolowal dzienniki oraz
upuszczanie przedmiotow po wyjsciu; ten prototyp jeszcze tego nie robi.

`Inventory` jest komponentem gracza, a `InventoryItem` komponentem aktora
przedmiotu. `inventory.items` zbiera komponenty z dzieci i dalszych
potomkow wlasciciela, np. z torby. Aktor bez rodzica nie nalezy do zadnego
ekwipunku. Przenoszenie polega na zmianie `itemActor.parent`; nie ma
osobnej listy, ktora trzeba aktualizowac. Zmiana rodzica, odlaczenie
lub zniszczenie aktora odswieza otwarte okno.

```js
const itemActor = new Actor('note', [new InventoryItem('Notatka')]);
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
Ten prototyp ekwipunku jest lokalny, nie dodaje komend serwera ani zapisu
przedmiotow do localStorage; nie zmienia autorytatywnego ruchu gracza.

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

`ResourceManager` laduje `client/src/game/resources/data/resources.json`:
liste sciezek wzgledem manifestu. Pliki zawieraja obiekty `{ id: data }`;
kazdy zasob wymaga `type`. Dane sa klonowane i rekurencyjnie zamrazane.
API: `register`, `get`, `has`, `getAllByType`. Poczatkowy manifest jest
pusty: nie przenosi postaci, map ani przedmiotow z innej gry.

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

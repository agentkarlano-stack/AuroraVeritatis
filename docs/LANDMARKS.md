# Profile background photos (landmarks)

Optional country backgrounds for the profile (owner directive 2026-10-24, §3). 30 photos of 19 countries, chosen from
**Wikimedia Commons featured pictures**: CC0, public domain, CC BY or CC BY-SA licences only. No stock site was used
and nothing was bought.

- **Files:** `public/media/landmarks/<id>-{1280,640,320}.webp`, resized WebP copies (quality 64–70) of 1920 px Commons
  thumbnails. About 5.2 MB in total; a page loads only the chosen photo (640 or 1280 px) and 320 px previews in the picker.
- **Data:** `src/data/landmarks.ts` (author, licence, licence URL, Commons page, aspect ratio), generated from the Commons
  API metadata. `src/lib/profileBackground.test.ts` checks that every entry has an author, a free licence and a Commons
  source.
- **Attribution:** every banner shows the landmark, the author, the licence (with "resized" for CC BY and CC BY-SA, since
  the copy is adapted) and links to the file page and the licence text. CC BY-SA applies to our resized copies too; they
  are offered under the same licence.
- **How they were fetched:** cloud sessions cannot reach Wikimedia. The work branch `claude/intro-work` (workflow
  `intro-fetch.yml`, input `intro-work/fetch.txt`) ran Commons API searches limited to
  `incategory:Featured_pictures_on_Wikimedia_Commons`, then downloaded the chosen 1920 px thumbnails with a descriptive
  User-Agent. Selection notes: two candidates were dropped because they did not show a recognisable landmark
  (Sydney Opera House roof detail, Sagrada Família ceiling); Australia therefore has no photo yet.
- **Privacy:** the suggestion uses only the country last opened in a dossier on this device; no location is inferred.
  A manual choice is never replaced.

## Manifest
| ID | Country | Landmark | Author | Licence | Source |
|---|---|---|---|---|---|
| hun-1 | HUN | Hungarian Parliament Building | Pierre Blaché | CC0 | [Hungarian Parliament Building 2023-9.jpg](https://commons.wikimedia.org/wiki/File:Hungarian_Parliament_Building_2023-9.jpg) |
| hun-2 | HUN | Széchenyi Chain Bridge at night | Wilfredor | CC0 | [Széchenyi Chain Bridge in Budapest at night.jpg](https://commons.wikimedia.org/wiki/File:Sz%C3%A9chenyi_Chain_Bridge_in_Budapest_at_night.jpg) |
| hun-3 | HUN | Buda Castle from Gellért Hill | Jakub Hałun | CC BY-SA 4.0 | [20190502 View of Buda Castle from Gellért Hill 1636 2135 DxO.jpg](https://commons.wikimedia.org/wiki/File:20190502_View_of_Buda_Castle_from_Gell%C3%A9rt_Hill_1636_2135_DxO.jpg) |
| rus-1 | RUS | Saint Basil's Cathedral, Moscow | Diego Delso | Public domain | [Catedral de San Basilio, Moscú, Rusia, 2016-10-03, DD 05-06 HDR.jpg](https://commons.wikimedia.org/wiki/File:Catedral_de_San_Basilio,_Mosc%C3%BA,_Rusia,_2016-10-03,_DD_05-06_HDR.jpg) |
| rus-2 | RUS | Winter Palace, Saint Petersburg | Никонико962 | CC BY-SA 4.0 | [Зимний дворец лето утро Санкт-Петербург 2026 01.jpg](https://commons.wikimedia.org/wiki/File:%D0%97%D0%B8%D0%BC%D0%BD%D0%B8%D0%B9_%D0%B4%D0%B2%D0%BE%D1%80%D0%B5%D1%86_%D0%BB%D0%B5%D1%82%D0%BE_%D1%83%D1%82%D1%80%D0%BE_%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3_2026_01.jpg) |
| rus-3 | RUS | Grand Kremlin Palace, Moscow | Юрий Д.К. | CC BY 4.0 | [Grand Kremlin Palace in summer sunset light 2025-8.jpg](https://commons.wikimedia.org/wiki/File:Grand_Kremlin_Palace_in_summer_sunset_light_2025-8.jpg) |
| aut-1 | AUT | Schönbrunn Palace, Vienna | Martin Falbisoner | CC BY-SA 4.0 | [Schoenbrunn Palace as seen from Neptune Fountain, September 2016.jpg](https://commons.wikimedia.org/wiki/File:Schoenbrunn_Palace_as_seen_from_Neptune_Fountain,_September_2016.jpg) |
| aut-2 | AUT | Neue Burg, Hofburg, Vienna | Diego Delso | CC BY-SA 4.0 | [Neue Burg, Hofburg, Viena, Austria, 2020-01-31, DD 143-145 HDR.jpg](https://commons.wikimedia.org/wiki/File:Neue_Burg,_Hofburg,_Viena,_Austria,_2020-01-31,_DD_143-145_HDR.jpg) |
| usa-1 | USA | Lower Manhattan skyline, New York | King of Hearts | CC BY-SA 4.0 | [Lower Manhattan from Jersey City September 2020 panorama.jpg](https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_September_2020_panorama.jpg) |
| usa-2 | USA | Golden Gate Bridge, San Francisco | Frank Schulenburg | CC BY-SA 4.0 | [Golden Gate Bridge as seen from Marshall’s Beach, March 2018.jpg](https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_as_seen_from_Marshall%E2%80%99s_Beach,_March_2018.jpg) |
| jpn-1 | JPN | Mount Fuji at sunset | Romain Guy from San Francisco, USA | CC0 | [Mount Fuji at sunset, March 2025.jpg](https://commons.wikimedia.org/wiki/File:Mount_Fuji_at_sunset,_March_2025.jpg) |
| jpn-2 | JPN | Minato City, Tokyo | David Kernan | CC BY 4.0 | [Minato City, Tokyo, Japan.jpg](https://commons.wikimedia.org/wiki/File:Minato_City,_Tokyo,_Japan.jpg) |
| gbr-1 | GBR | Palace of Westminster, London | Colin | CC BY-SA 4.0 | [Palace of Westminster from the dome on Methodist Central Hall.jpg](https://commons.wikimedia.org/wiki/File:Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg) |
| gbr-2 | GBR | Tower Bridge at dusk, London | Diliff | CC BY-SA 3.0 | [Tower Bridge London Dusk Feb 2006.jpg](https://commons.wikimedia.org/wiki/File:Tower_Bridge_London_Dusk_Feb_2006.jpg) |
| deu-1 | DEU | Neuschwanstein Castle | Wilfredor | CC0 | [Neuschwanstein Castle 2024.jpg](https://commons.wikimedia.org/wiki/File:Neuschwanstein_Castle_2024.jpg) |
| deu-2 | DEU | Brandenburg Gate, Berlin | Diego Delso | CC BY-SA 4.0 | [Puerta de Brandeburgo, Berlín, Alemania, 2016-04-21, DD 49-51 HDR.jpg](https://commons.wikimedia.org/wiki/File:Puerta_de_Brandeburgo,_Berl%C3%ADn,_Alemania,_2016-04-21,_DD_49-51_HDR.jpg) |
| fra-1 | FRA | Eiffel Tower, Paris | Jorge Royan | CC BY-SA 3.0 | [Paris - The Eiffel Tower in spring - 2307.jpg](https://commons.wikimedia.org/wiki/File:Paris_-_The_Eiffel_Tower_in_spring_-_2307.jpg) |
| fra-2 | FRA | Mont-Saint-Michel at sunrise | Lynx1211 | CC BY-SA 4.0 | [Mont St Michel at sunrise.jpg](https://commons.wikimedia.org/wiki/File:Mont_St_Michel_at_sunrise.jpg) |
| ita-1 | ITA | Colosseum, Rome | Anil Öztas | CC BY 4.0 | [Rom (IT), Kolosseum -- 2024 -- 0610.jpg](https://commons.wikimedia.org/wiki/File:Rom_(IT),_Kolosseum_--_2024_--_0610.jpg) |
| ita-2 | ITA | Florence Cathedral | Petar Milošević | CC BY-SA 4.0 | [Florence Duomo from Michelangelo hill.jpg](https://commons.wikimedia.org/wiki/File:Florence_Duomo_from_Michelangelo_hill.jpg) |
| esp-1 | ESP | Alhambra, Granada | Jebulon | Public domain | [Alhambra in the evening.jpg](https://commons.wikimedia.org/wiki/File:Alhambra_in_the_evening.jpg) |
| chn-1 | CHN | Great Wall at Badaling | CEphoto, Uwe Aranas | CC BY-SA 3.0 | [Badaling China Great-Wall-of-China-01.jpg](https://commons.wikimedia.org/wiki/File:Badaling_China_Great-Wall-of-China-01.jpg) |
| chn-2 | CHN | Pudong skyline, Shanghai | King of Hearts | CC BY-SA 4.0 | [Pudong Shanghai November 2017 panorama.jpg](https://commons.wikimedia.org/wiki/File:Pudong_Shanghai_November_2017_panorama.jpg) |
| ind-1 | IND | Taj Mahal, Agra | Yann; edited by King of Hearts | CC BY-SA 4.0 | [Taj Mahal, Agra, India edit2.jpg](https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg) |
| egy-1 | EGY | Pyramids of Giza | Ricardo Liberato | CC BY-SA 2.0 | [All Gizah Pyramids.jpg](https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg) |
| tur-1 | TUR | Hagia Sophia, Istanbul | Arild Vågen | CC BY-SA 3.0 | [Hagia Sophia Mars 2013.jpg](https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg) |
| cze-1 | CZE | Prague Castle and Charles Bridge | Diliff | CC BY-SA 3.0 | [Prague Panorama - Oct 2010.jpg](https://commons.wikimedia.org/wiki/File:Prague_Panorama_-_Oct_2010.jpg) |
| grc-1 | GRC | Acropolis of Athens at night | Giles Laurent | CC BY-SA 4.0 | [1029 Acropolis of Athens in Greece at night Photo by Giles Laurent.jpg](https://commons.wikimedia.org/wiki/File:1029_Acropolis_of_Athens_in_Greece_at_night_Photo_by_Giles_Laurent.jpg) |
| bra-1 | BRA | Rio de Janeiro and Christ the Redeemer | Wilfredor | CC0 | [Rio skyline and Cristo Redentor from Sugarloaf Mountain, Brazil.jpg](https://commons.wikimedia.org/wiki/File:Rio_skyline_and_Cristo_Redentor_from_Sugarloaf_Mountain,_Brazil.jpg) |
| can-1 | CAN | Moraine Lake, Banff | Gorgo | Public domain | [Moraine Lake 17092005.jpg](https://commons.wikimedia.org/wiki/File:Moraine_Lake_17092005.jpg) |

/**
 * Country landmark photos for optional profile backgrounds (directive §3). Selected from Wikimedia Commons featured
 * pictures; each keeps its author and licence, shown under the image. Files are resized WebP copies in
 * public/media/landmarks (`<id>-1280|640|320.webp`). Manifest and selection notes: docs/LANDMARKS.md.
 * Generated from the Commons metadata; edit by re-running the selection, not by hand.
 */
export interface Landmark {
  id: string;
  /** ISO 3166-1 alpha-3. */
  country: string;
  label: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** Wikimedia Commons file page (source and full licence). */
  page: string;
  /** Width ÷ height of the original. */
  aspect: number;
}

export const LANDMARKS: Landmark[] = [
  { id: "hun-1", country: "HUN", label: "Hungarian Parliament Building", author: "Pierre Blaché", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Hungarian_Parliament_Building_2023-9.jpg", aspect: 1.778 },
  { id: "hun-2", country: "HUN", label: "Széchenyi Chain Bridge at night", author: "Wilfredor", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Sz%C3%A9chenyi_Chain_Bridge_in_Budapest_at_night.jpg", aspect: 1.789 },
  { id: "hun-3", country: "HUN", label: "Buda Castle from Gellért Hill", author: "Jakub Hałun", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:20190502_View_of_Buda_Castle_from_Gell%C3%A9rt_Hill_1636_2135_DxO.jpg", aspect: 1.505 },
  { id: "rus-1", country: "RUS", label: "Saint Basil's Cathedral, Moscow", author: "Diego Delso", license: "Public domain", licenseUrl: "", page: "https://commons.wikimedia.org/wiki/File:Catedral_de_San_Basilio,_Mosc%C3%BA,_Rusia,_2016-10-03,_DD_05-06_HDR.jpg", aspect: 1.16 },
  { id: "rus-2", country: "RUS", label: "Winter Palace, Saint Petersburg", author: "Никонико962", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:%D0%97%D0%B8%D0%BC%D0%BD%D0%B8%D0%B9_%D0%B4%D0%B2%D0%BE%D1%80%D0%B5%D1%86_%D0%BB%D0%B5%D1%82%D0%BE_%D1%83%D1%82%D1%80%D0%BE_%D0%A1%D0%B0%D0%BD%D0%BA%D1%82-%D0%9F%D0%B5%D1%82%D0%B5%D1%80%D0%B1%D1%83%D1%80%D0%B3_2026_01.jpg", aspect: 1.509 },
  { id: "rus-3", country: "RUS", label: "Grand Kremlin Palace, Moscow", author: "Юрий Д.К.", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0", page: "https://commons.wikimedia.org/wiki/File:Grand_Kremlin_Palace_in_summer_sunset_light_2025-8.jpg", aspect: 1.396 },
  { id: "aut-1", country: "AUT", label: "Schönbrunn Palace, Vienna", author: "Martin Falbisoner", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Schoenbrunn_Palace_as_seen_from_Neptune_Fountain,_September_2016.jpg", aspect: 1.82 },
  { id: "aut-2", country: "AUT", label: "Neue Burg, Hofburg, Vienna", author: "Diego Delso", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Neue_Burg,_Hofburg,_Viena,_Austria,_2020-01-31,_DD_143-145_HDR.jpg", aspect: 2.036 },
  { id: "usa-1", country: "USA", label: "Lower Manhattan skyline, New York", author: "King of Hearts", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_September_2020_panorama.jpg", aspect: 2.0 },
  { id: "usa-2", country: "USA", label: "Golden Gate Bridge, San Francisco", author: "Frank Schulenburg", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_as_seen_from_Marshall%E2%80%99s_Beach,_March_2018.jpg", aspect: 1.778 },
  { id: "jpn-1", country: "JPN", label: "Mount Fuji at sunset", author: "Romain Guy from San Francisco, USA", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Mount_Fuji_at_sunset,_March_2025.jpg", aspect: 1.5 },
  { id: "jpn-2", country: "JPN", label: "Minato City, Tokyo", author: "David Kernan", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0", page: "https://commons.wikimedia.org/wiki/File:Minato_City,_Tokyo,_Japan.jpg", aspect: 1.778 },
  { id: "gbr-1", country: "GBR", label: "Palace of Westminster, London", author: "Colin", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Palace_of_Westminster_from_the_dome_on_Methodist_Central_Hall.jpg", aspect: 1.5 },
  { id: "gbr-2", country: "GBR", label: "Tower Bridge at dusk, London", author: "Diliff", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", page: "https://commons.wikimedia.org/wiki/File:Tower_Bridge_London_Dusk_Feb_2006.jpg", aspect: 2.256 },
  { id: "deu-1", country: "DEU", label: "Neuschwanstein Castle", author: "Wilfredor", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Neuschwanstein_Castle_2024.jpg", aspect: 1.5 },
  { id: "deu-2", country: "DEU", label: "Brandenburg Gate, Berlin", author: "Diego Delso", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Puerta_de_Brandeburgo,_Berl%C3%ADn,_Alemania,_2016-04-21,_DD_49-51_HDR.jpg", aspect: 1.5 },
  { id: "fra-1", country: "FRA", label: "Eiffel Tower, Paris", author: "Jorge Royan", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", page: "https://commons.wikimedia.org/wiki/File:Paris_-_The_Eiffel_Tower_in_spring_-_2307.jpg", aspect: 1.5 },
  { id: "fra-2", country: "FRA", label: "Mont-Saint-Michel at sunrise", author: "Lynx1211", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Mont_St_Michel_at_sunrise.jpg", aspect: 1.5 },
  { id: "ita-1", country: "ITA", label: "Colosseum, Rome", author: "Anil Öztas", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0", page: "https://commons.wikimedia.org/wiki/File:Rom_(IT),_Kolosseum_--_2024_--_0610.jpg", aspect: 1.5 },
  { id: "ita-2", country: "ITA", label: "Florence Cathedral", author: "Petar Milošević", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Florence_Duomo_from_Michelangelo_hill.jpg", aspect: 1.379 },
  { id: "esp-1", country: "ESP", label: "Alhambra, Granada", author: "Jebulon", license: "Public domain", licenseUrl: "", page: "https://commons.wikimedia.org/wiki/File:Alhambra_in_the_evening.jpg", aspect: 2.828 },
  { id: "chn-1", country: "CHN", label: "Great Wall at Badaling", author: "CEphoto, Uwe Aranas", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", page: "https://commons.wikimedia.org/wiki/File:Badaling_China_Great-Wall-of-China-01.jpg", aspect: 1.561 },
  { id: "chn-2", country: "CHN", label: "Pudong skyline, Shanghai", author: "King of Hearts", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Pudong_Shanghai_November_2017_panorama.jpg", aspect: 2.0 },
  { id: "ind-1", country: "IND", label: "Taj Mahal, Agra", author: "Yann; edited by King of Hearts", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg", aspect: 1.521 },
  { id: "egy-1", country: "EGY", label: "Pyramids of Giza", author: "Ricardo Liberato", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0", page: "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg", aspect: 1.505 },
  { id: "tur-1", country: "TUR", label: "Hagia Sophia, Istanbul", author: "Arild Vågen", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", page: "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_Mars_2013.jpg", aspect: 1.498 },
  { id: "cze-1", country: "CZE", label: "Prague Castle and Charles Bridge", author: "Diliff", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", page: "https://commons.wikimedia.org/wiki/File:Prague_Panorama_-_Oct_2010.jpg", aspect: 4.706 },
  { id: "grc-1", country: "GRC", label: "Acropolis of Athens at night", author: "Giles Laurent", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:1029_Acropolis_of_Athens_in_Greece_at_night_Photo_by_Giles_Laurent.jpg", aspect: 1.5 },
  { id: "bra-1", country: "BRA", label: "Rio de Janeiro and Christ the Redeemer", author: "Wilfredor", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", page: "https://commons.wikimedia.org/wiki/File:Rio_skyline_and_Cristo_Redentor_from_Sugarloaf_Mountain,_Brazil.jpg", aspect: 1.659 },
  { id: "can-1", country: "CAN", label: "Moraine Lake, Banff", author: "Gorgo", license: "Public domain", licenseUrl: "", page: "https://commons.wikimedia.org/wiki/File:Moraine_Lake_17092005.jpg", aspect: 1.333 },
];

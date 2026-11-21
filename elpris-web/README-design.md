# Elpris — minimal design med prognos och avgifter

## Mål

Idag, imorgon och femdagarsprognos. GPS → elområde. **Standard: inkl. alla avgifter** (switch kan stängas av för ren spot).

## Avgiftsläge (default på)

Marginal **variabel kostnad per kWh** i **öre/kWh inkl. moms** (inga fasta månadsavgifter):

```
totalt_inkl = (spot_ex + nät_ex + energiskatt_ex + cert_ex + handel_ex) × 1,25
```

| Komponent | Källa / värde |
| --- | --- |
| Spot / prognos p50 | elprisetjustnu.se / Elfacit (ex moms) |
| Elnät (variabel) | SCB TAB3950-inspirerat zonmedel lägenhet/villa, **ex moms** |
| Energiskatt | Skatteverket 36 öre ex (2026); SE1 14,5 öre (reducerat norr) |
| Certifikat + handel | ~2,5 + 6 öre ex (typiskt rörligt avtal) |
| Moms | 25 % på variabla delar |
| **Ej med** | Fast nät/handels-abonnemang (kr/mån) |

**Begränsning:** Ingen exakt nätägare via GPS — välj **lägenhet** eller **villa**; siffran är zonmedel, inte din adress. Se `fees.js`.

Av-läge visar spot/prognos **utan** moms, skatt och nät (som idag).

## Datakällor spot/prognos

Se tidigare avsnitt: elprisetjustnu.se (spot), elfacit.se (prognos D+2…D+6).

## Köra lokalt

```bash
cd /cursor/stores/self/elpris
python3 -m http.server 8765 --bind 127.0.0.1
```
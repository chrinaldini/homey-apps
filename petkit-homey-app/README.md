# PetKit for Homey

En uoffisiell Homey-app som kobler PetKit smarte kjæledyrenheter til Homey via PetKit sitt API.

## Støttede enheter

| Type | Enheter |
|------|---------|
| **Kattebokser** | Pura X, Pura MAX, Pura MAX 2, Purobot |
| **Matere** | Feeder Mini, Fresh Element, Fresh Element D4, Fresh Element Gemini, Fresh Element Solo, YumShare (solo & dual) |
| **Vannfontener** | Eversweet 3 Pro, Eversweet 5 Mini, Eversweet Solo 2, Eversweet MAX |
| **Luftrensere** | Pura Air, Air Magicube |

## Installasjon

### Krav
- Node.js 16+
- Homey CLI (`npm install -g homey`)
- Homey Pro (SDK 3)

### Steg

```bash
# 1. Last ned eller klon dette prosjektet
cd petkit-homey-app

# 2. Installer Homey CLI om du ikke har det
npm install -g homey

# 3. Kjør appen lokalt for testing
homey app run

# 4. Eller publiser til Homey Pro
homey app install
```

## Oppsett

> ⚠️ **Viktig:** PetKit tillater kun én aktiv sesjon per konto. 
> Det anbefales å bruke en **sekundær PetKit-konto** via familiedeling.

1. Gå til **Innstillinger → PetKit** i Homey og velg riktig region (Europa for norske brukere)
2. Gå til **Enheter → Legg til enhet → PetKit**
3. Logg inn med e-post og passord
4. Velg enhetene du vil legge til

## Flow-støtte

### Triggere
- Enhet online/offline
- Katteboks: rengjøring startet / ferdig
- Katteboks: katt gikk inn / forlot
- Katteboks: søppelkasse full
- Mater: matnivå lavt
- Mater: kjæledyr begynte / sluttet å spise

### Betingelser
- Enhet er online
- Katteboks er ren
- Mater har mat

### Handlinger
- Start/stopp rengjøring
- Start luktfjerning
- Gi mat (med mengde i gram)
- Skru av/på enhetslys

## Teknisk info

Appen bruker PetKit sitt **uoffisielle API** (reverse-engineered fra mobilappen). 
PetKit kan endre API-et uten varsel, noe som potensielt kan bryte appen.

API-endepunkter per region:
- **EU:** `https://api.eu.petkt.com/latest`
- **US:** `https://api.petkt.com/latest`
- **Asia:** `https://api.petktasia.com/latest`
- **Kina:** `https://api.petkit.cn/6`

Polling: hvert 60. sekund.

## Ansvarsfraskrivelse

Dette er et uavhengig community-prosjekt og er ikke tilknyttet PetKit på noen måte. 
Påloggingsinformasjon lagres kun lokalt på din Homey.

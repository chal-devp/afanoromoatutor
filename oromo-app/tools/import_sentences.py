"""Build a larger sentence bank from FLORES-200 (CC-BY-SA 4.0, credit Meta AI / NLLB team).
Run on your own computer:  python tools/import_sentences.py
UNTESTED: check the download URL still works. FLORES sentences are news-style, so we keep short ones only.
Output goes to frontend/sentences_flores.json (merge into sentences.json after native-speaker review)."""
import io, json, tarfile, urllib.request
URL = "https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz"
MAX_WORDS = 12
data = urllib.request.urlopen(URL).read()
tar = tarfile.open(fileobj=io.BytesIO(data))
def lines(split, code):
    return tar.extractfile(f"flores200_dataset/{split}/{code}.{split}").read().decode("utf-8").splitlines()
out = []
for split in ("dev", "devtest"):
    om, am, en = lines(split, "gaz_Latn"), lines(split, "amh_Ethi"), lines(split, "eng_Latn")
    for i, (o, a, e) in enumerate(zip(om, am, en)):
        if len(o.split()) <= MAX_WORDS and len(e.split()) <= MAX_WORDS:
            out.append({"id": f"f{split[:3]}{i}", "om": o, "am": a, "en": e, "reviewed": False})
json.dump(out, open("frontend/sentences_flores.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "sentences written")

import csv
import io
import json
import sys
import zipfile


def main():
    _, inzip, outjson = sys.argv
    ret = {}
    with zipfile.ZipFile(inzip) as z:
        for fname in z.namelist():
            name, _, _ = fname.rpartition('.')
            if name == 'shapes':
                continue
            fbytes = z.read(fname)
            ret[name] = list(csv.reader(io.BytesIO(fbytes)))
    with open(outjson, 'w') as outfile:
        json.dump(ret, outfile)


main()

import json,sys
c=json.load(open('src/content/_cache.json'))
full='-v' in sys.argv
for k in [a for a in sys.argv[1:] if a!='-v']:
    print('=====',k)
    for blk in c[k]['blocks']:
        for u in blk:
            bad=u['x']!=0 or any(w in u['o'] for w in ('rror','denied','not found','No such','cannot','usage','Traceback'))
            if full or bad:
                print(' ',u['c'][:80].replace('\n',' | '),'->',u['o'][:200].replace('\n',' / '),'[%s]'%u['x'])

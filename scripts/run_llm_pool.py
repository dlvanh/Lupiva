"""Run API extraction on verified outgoing image regions and keep values pending."""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.llm_workflow import run
from ocr_pool.llm import API_ENGINES, API_NAMES

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--model',help='Override the configured model for this run only')
    parser.add_argument('--engine',choices=API_ENGINES,default='gemini')
    parser.add_argument('--result-rules',type=Path,help='Optional SQLite database of literal result rules')
    parser.add_argument('--fast-pft',action='store_true',help='Use the fast PFT profile for eligible Token Harbor images')
    parser.add_argument('--fast-labs',action='store_true',help='Use the fast laboratory profile for eligible Token Harbor images')
    parser.add_argument('--deadline',type=float,help='Epoch seconds after which no further image is sent')
    args=parser.parse_args()
    name=API_NAMES[args.engine]
    try:
        run(json.loads(args.manifest.read_text(encoding='utf-8')),args.output,ROOT,model=args.model,engine=args.engine,
            result_rules_db=args.result_rules,fast_pft=args.fast_pft,fast_labs=args.fast_labs,deadline=args.deadline)
        print(name+' extraction completed; values await human review.',flush=True)
        return 0
    except Exception as error:
        # Transport errors are already sanitized; never dump request bodies.
        print(name+' processing failed: '+str(error),flush=True)
        return 1

if __name__=='__main__':raise SystemExit(main())

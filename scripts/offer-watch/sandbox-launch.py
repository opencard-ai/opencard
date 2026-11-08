"""Portable fixed-entry launcher. No local credential-file lookup; SDK auth is explicit external env only."""
import argparse,os,subprocess,tempfile,sys
from pathlib import Path

def main():
 parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group(required=True);mode.add_argument('--fixtures',action='store_true');mode.add_argument('--sdk',action='store_true');parser.add_argument('--confirm-sandbox',action='store_true');parser.add_argument('--namespace');parser.add_argument('--out',required=True);parser.add_argument('--fault-scenarios',action='store_true')
 a=parser.parse_args();repo=Path(__file__).resolve().parents[2]
 cmd=[str(repo/'node_modules/.bin/tsx'),str(repo/('scripts/offer-watch/sandbox-fault-runner.ts' if a.fault_scenarios else 'scripts/offer-watch/sandbox-runner.ts')),'--sdk' if a.sdk else '--fixtures','--out',a.out]
 if a.confirm_sandbox:cmd+=['--confirm-sandbox']
 if a.namespace:cmd+=['--namespace',a.namespace]
 secret_names=['OPENCARD_SANDBOX_URL','OPENCARD_SANDBOX_TOKEN']
 with tempfile.TemporaryDirectory(prefix='opencard-manual-home-') as home:
  env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'HOME':home,'CI':'true','NEXT_TELEMETRY_DISABLED':'1'}
  if a.sdk:
   for key in ['OPENCARD_SANDBOX_DATABASE_ID',*secret_names]:env[key]=os.environ.get(key,'')
  result=subprocess.run(cmd,cwd=repo,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 output=result.stdout
 for key in secret_names:
  value=os.environ.get(key,'')
  if value:output=output.replace(value.encode(),b'[REDACTED]')
 sys.stdout.buffer.write(output);return result.returncode
if __name__=='__main__':
 try:sys.exit(main())
 except Exception:print('Fixed sandbox launcher failed closed; details suppressed',file=sys.stderr);sys.exit(1)

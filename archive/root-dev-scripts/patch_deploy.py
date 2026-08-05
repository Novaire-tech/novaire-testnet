import sys
import re

with open('scripts/deploy_xlm_epoch.ts', 'r') as f:
    content = f.read()

replacement = """    const out = runCmdNoFail(`stellar contract invoke ${invokeArgs}`);
    if (out.includes("AlreadyInitialized")) {
        console.log("Epoch already deployed.");
    } else if (out.includes("error")) {
        console.error(`Epoch deploy failed:\\n${out}`);
        process.exit(1);
    } else if (out.trim() !== '') {
        console.log(`Epoch Deployed! Epoch ID: ${out.trim()}`);
    } else {
        console.error(`Epoch deploy failed with empty output.`);
        process.exit(1);
    }"""

content = re.sub(r'    const out = runCmdNoFail\(`stellar contract invoke \$\{invokeArgs\}`\);\n    if \(out\.includes\("AlreadyInitialized"\)\) \{[\s\S]*?console\.warn\(`Epoch deploy failed: \$\{out\}`\);\n    \}', replacement, content)

with open('scripts/deploy_xlm_epoch.ts', 'w') as f:
    f.write(content)

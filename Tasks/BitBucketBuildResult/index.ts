import { getInputValues } from "./input-values";
import * as tl from "vsts-task-lib/task";

async function main(): Promise<void> {
    const inputs = getInputValues();

    tl.setResult(tl.TaskResult.Succeeded,
        `Successfully updated Build Status for to repository ${inputs.bitbucketRepository}`);
}

main().catch(e => {
    tl.error(e);
    tl.setResult(tl.TaskResult.Failed, "Error publishing build result");
});

// QVAC Quickstart — test SDK installation
// Loads a tiny LLM and generates a completion

const { loadModel, LLAMA_3_2_1B_INST_Q4_0, completion, unloadModel } = await import("@qvac/sdk");

try {
    // Load a model into memory
    console.log("▸ Loading model...");
    const modelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        onProgress: (p) => {
            const mb = (n) => (n / 1e6).toFixed(1);
            const line = `▸ Downloading ${p.percentage.toFixed(0)}% (${mb(p.downloaded)}/${mb(p.total)} MB)`;
            process.stderr.write(process.stderr.isTTY ? `\r${line}` : `${line}\n`);
            if (p.percentage >= 100) process.stderr.write("\n");
        },
    });

    console.log(`✓ Model loaded: ${modelId}`);

    // Run inference
    const history = [
        { role: "user", content: "Explain quantum computing in one sentence." },
    ];

    console.log("▸ Generating response...\n");
    const result = completion({ modelId, history, stream: true });

    let fullText = "";
    for await (const token of result.tokenStream) {
        process.stdout.write(token);
        fullText += token;
    }
    console.log("\n\n✓ Generation complete");

    // Free resources
    await unloadModel({ modelId });
    console.log("✓ Model unloaded");
} catch (error) {
    console.error("✖ Error:", error);
    process.exit(1);
}

export {};

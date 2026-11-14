import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeLoraTensors,
  type LoraTensorLike,
} from "../ui/src/utils/loraInfo.ts";

const tensor = (name: string, shape: number[]): LoraTensorLike => ({
  name,
  shape,
});

test("kohya lora_down/lora_up ranks are inferred", () => {
  const summary = summarizeLoraTensors([
    tensor("lora_unet_down_blocks_0_attn.lora_down.weight", [32, 320]),
    tensor("lora_unet_down_blocks_0_attn.lora_up.weight", [320, 32]),
    tensor("lora_unet_down_blocks_0_attn.alpha", []),
  ]);

  assert.equal(summary.networkType, "LoRA");
  assert.equal(summary.rank, 32);
  assert.deepEqual(summary.ranks, [32]);
});

test("peft lora_A/lora_B ranks are inferred", () => {
  const summary = summarizeLoraTensors([
    tensor("transformer.blocks.0.attn.to_q.lora_A.weight", [16, 2048]),
    tensor("transformer.blocks.0.attn.to_q.lora_B.weight", [2048, 16]),
  ]);

  assert.equal(summary.networkType, "LoRA");
  assert.equal(summary.rank, 16);
  assert.deepEqual(summary.ranks, [16]);
});

test("conv ranks use the same dimension for up and down weights", () => {
  const summary = summarizeLoraTensors([
    tensor("lora_unet_down_blocks_0_conv.lora_down.weight", [8, 320, 3, 3]),
    tensor("lora_unet_down_blocks_0_conv.lora_up.weight", [320, 8, 3, 3]),
  ]);

  assert.equal(summary.rank, 8);
  assert.deepEqual(summary.ranks, [8]);
});

test("mixed ranks report the most common rank and every unique value", () => {
  const summary = summarizeLoraTensors([
    tensor("a.lora_down.weight", [32, 320]),
    tensor("a.lora_up.weight", [320, 32]),
    tensor("b.lora_down.weight", [32, 640]),
    tensor("b.lora_up.weight", [640, 32]),
    tensor("c.lora_down.weight", [16, 320]),
    tensor("c.lora_up.weight", [320, 16]),
  ]);

  assert.equal(summary.rank, 32);
  assert.deepEqual(summary.ranks, [16, 32]);
});

test("ss_network_dim metadata takes precedence", () => {
  const summary = summarizeLoraTensors(
    [
      tensor("a.lora_down.weight", [16, 320]),
      tensor("a.lora_up.weight", [320, 16]),
    ],
    { ss_network_dim: "48" },
  );

  assert.equal(summary.rank, 48);
  assert.deepEqual(summary.ranks, [16]);
  assert.equal(summarizeLoraTensors([], { ss_network_dim: '"64"' }).rank, 64);
});

test("LoKr and unknown network types are detected", () => {
  const lokr = summarizeLoraTensors([
    tensor("lora_unet_x.lokr_w1_a", [128, 32]),
    tensor("lora_unet_x.lokr_w1_b", [32, 128]),
  ]);
  assert.equal(lokr.networkType, "LoKr");
  assert.equal(lokr.rank, null);

  const other = summarizeLoraTensors([tensor("something.diff", [320, 320])]);
  assert.equal(other.networkType, "Other");
  assert.equal(other.rank, null);

  const empty = summarizeLoraTensors([]);
  assert.equal(empty.networkType, null);
  assert.equal(empty.rank, null);
  assert.deepEqual(empty.ranks, []);
});

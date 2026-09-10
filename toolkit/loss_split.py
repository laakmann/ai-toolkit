from typing import Union


def resolve_loss_split(
    *,
    ds_value: Union[str, None],
    global_value: Union[str, None],
    global_explicit: bool,
    effective_depth_weight: float,
) -> Union[str, None]:
    if ds_value == 'sum':
        return None
    if ds_value is not None:
        return ds_value
    if global_explicit:
        return global_value
    return 'diffusion_depth' if effective_depth_weight > 0.0 else None

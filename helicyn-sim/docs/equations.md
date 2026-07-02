# Equations

All symbols and default constants below match the source in
`helicyn_sim/models/`. See `docs/model_assumptions.md` for why these forms
and constants were chosen.

## Server power (`models/power.py`)

```
cpu_utilization      = clamp(cpu_allocated_units / cpu_capacity_units, 0, 1)
memory_utilization   = clamp(memory_allocated_gb / memory_capacity_gb, 0, 1)

cpu_dynamic_power_w    = max_cpu_dynamic_power_w * cpu_utilization ** 1.4 * dvfs.power_multiplier
memory_dynamic_power_w = memory_power_coefficient_w * memory_utilization   # default 60 W at 100%

fan_factor(rack_temp_c):
    rack_temp_c <= 27      -> 1.0
    27 < rack_temp_c <= 35 -> 1.0 + 0.05 * (rack_temp_c - 27)
    rack_temp_c > 35       -> 1.4 + 0.10 * (rack_temp_c - 35)

server_power_w = idle_power_w
               + cpu_dynamic_power_w
               + memory_dynamic_power_w
               + fan_overhead_w * fan_factor(rack_temp_c)

# if server is asleep:
server_power_w = sleep_power_w
```

DVFS states (`models/dvfs.py`):

| state             | performance_multiplier | power_multiplier |
|-------------------|------------------------:|------------------:|
| high_performance  | 1.00                    | 1.00               |
| balanced (default)| 0.85                    | 0.75               |
| power_saver       | 0.65                    | 0.55               |

`power_multiplier` scales `cpu_dynamic_power_w` only.

## Dynamic PUE / cooling (`models/cooling.py`)

```
it_power_kw = sum(server_power_w for servers in site) / 1000

dynamic_pue = base_pue
            + ambient_temp_coefficient * max(0, ambient_temp_c - cooling_reference_temp_c)
            + hotspot_pue_penalty                      # default 0.0 in Phase 1
dynamic_pue = clamp(dynamic_pue, 1.05, 2.20)

facility_power_kw = it_power_kw * dynamic_pue
cooling_power_kw  = facility_power_kw - it_power_kw
```

Default `ambient_temp_coefficient = 0.008`.

## Rack thermal proxy (`models/thermal.py`)

```
rack_power_kw = sum(server_power_w for servers in rack) / 1000

cooling_effort = min(max_cooling_effort,
                      cooling_control_gain * max(0, rack_temp_c - cooling_reference_temp_c))

rack_temp_next = rack_temp_c
                + dt_minutes * heat_gain_coefficient * rack_power_kw
                - dt_minutes * cooling_coefficient * cooling_effort
                + dt_minutes * ambient_coupling_coefficient * (ambient_temp_c - rack_temp_c)
```

Defaults: `heat_gain_coefficient=0.025`, `cooling_coefficient=0.08`,
`ambient_coupling_coefficient=0.002`, `cooling_control_gain=0.15`,
`max_cooling_effort=10`.

Thresholds: warm `27C`, hot/thermal-violation `32C`, critical `38C`.

## Energy (`simulation/accounting.py`)

```
it_energy_kwh       = it_power_kw       * dt_hours
facility_energy_kwh = facility_power_kw * dt_hours
cooling_energy_kwh  = cooling_power_kw  * dt_hours
```

## Carbon

```
carbon_kgco2e = facility_energy_kwh * carbon_intensity_gco2e_per_kwh / 1000
```

## Cost

```
cost_usd = facility_energy_kwh * electricity_price_usd_per_mwh / 1000
```

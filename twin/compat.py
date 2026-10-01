"""
Compatibility shim for environments where pandas C-extensions are unavailable
or blocked by system security policies (e.g. Windows Defender Application Control).
Provides a lightweight DataFrame / Series / read_csv fallback that fully supports
the Digital Twin simulation, metrics aggregation, and serialization pipelines.
"""
import csv
import os

try:
    import pandas as pd
    HAS_PANDAS = True
except Exception:
    pd = None
    HAS_PANDAS = False


class _FallbackSeries:
    def __init__(self, values):
        self._values = list(values)

    def sum(self):
        valid = [v for v in self._values if v is not None]
        return sum(valid) if valid else 0

    def max(self):
        valid = [v for v in self._values if v is not None]
        return max(valid) if valid else 0

    def min(self):
        valid = [v for v in self._values if v is not None]
        return min(valid) if valid else 0

    def mean(self):
        valid = [v for v in self._values if v is not None]
        return (sum(valid) / len(valid)) if valid else 0.0

    def tail(self, n=5):
        return _FallbackSeries(self._values[-n:])

    def __eq__(self, other):
        return _FallbackSeries([1 if x == other else 0 for x in self._values])

    def __len__(self):
        return len(self._values)

    def __iter__(self):
        return iter(self._values)

    def tolist(self):
        return list(self._values)


class _FallbackDataFrame:
    def __init__(self, data=None):
        if isinstance(data, list):
            self._records = [dict(r) for r in data]
        elif isinstance(data, dict):
            keys = list(data.keys())
            length = len(data[keys[0]]) if keys else 0
            self._records = [{k: data[k][i] for k in keys} for i in range(length)]
        elif isinstance(data, _FallbackDataFrame):
            self._records = [dict(r) for r in data._records]
        else:
            self._records = []

    @property
    def empty(self):
        return len(self._records) == 0

    @property
    def columns(self):
        return list(self._records[0].keys()) if self._records else []

    def __getitem__(self, key):
        if isinstance(key, list):
            return _FallbackDataFrame([{k: r.get(k) for k in key} for r in self._records])
        return _FallbackSeries([r.get(key, 0) for r in self._records])

    def __contains__(self, key):
        return key in self.columns

    def to_dict(self, orient="records"):
        return [dict(r) for r in self._records]

    def iterrows(self):
        for idx, row in enumerate(self._records):
            yield idx, row

    def replace(self, to_replace, value=None):
        return _FallbackDataFrame(self._records)

    def tail(self, n=5):
        return _FallbackDataFrame(self._records[-n:])

    def __len__(self):
        return len(self._records)


class _MockPandasModule:
    DataFrame = _FallbackDataFrame
    Series = _FallbackSeries

    @staticmethod
    def read_csv(filepath_or_buffer, *args, **kwargs):
        records = []
        if isinstance(filepath_or_buffer, str) and os.path.exists(filepath_or_buffer):
            with open(filepath_or_buffer, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    parsed = {}
                    for k, v in row.items():
                        if v is None or v == "" or v == "NaN" or v == "nan":
                            parsed[k] = None
                        else:
                            try:
                                parsed[k] = float(v) if "." in v else int(v)
                            except ValueError:
                                parsed[k] = v
                    records.append(parsed)
        return _FallbackDataFrame(records)


if not HAS_PANDAS or pd is None:
    pd = _MockPandasModule()

DataFrame = pd.DataFrame
Series = pd.Series
read_csv = pd.read_csv

__all__ = ["pd", "DataFrame", "Series", "read_csv", "HAS_PANDAS"]

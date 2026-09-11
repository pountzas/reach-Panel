import { getEmbeddedFlag } from 'svg-flags';
import { SvgXml } from 'react-native-svg';

type Props = {
  country: string;
  size?: number;
};

export function CountryFlag({ country, size = 20 }: Props) {
  const xml = getEmbeddedFlag(country);
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={Math.round(size * 0.75)} />;
}

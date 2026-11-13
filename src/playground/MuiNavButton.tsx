import MuiButton from '@mui/material/Button';
import type { ElementProps } from '../index';

type Props = ElementProps<HTMLAnchorElement> & { variant: 'contained' | 'text'; size: 'small' };

const MuiNavButton = (props: Props) => <MuiButton {...props} component="a" />;

export default MuiNavButton;
